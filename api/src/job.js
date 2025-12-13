const logplease = require('logplease');
const { v4: uuidv4 } = require('uuid');
const cp = require('child_process');
const path = require('path');
const config = require('./config');
const fs = require('fs/promises');
const globals = require('./globals');
const queueManager = require('./queue-manager');
const { MetricsRecorder } = require('./metrics-utils');

const ISOLATE_PATH = '/usr/local/bin/isolate';

const job_states = {
  READY: Symbol('Ready to be primed'),
  PRIMED: Symbol('Primed and ready for execution'),
  EXECUTED: Symbol('Executed and ready for cleanup'),
};

class Job {
  #dirty_boxes;

  constructor({
    runtime,
    files,
    args,
    stdin,
    timeouts,
    cpu_times,
    memory_limits,
  }) {
    this.uuid = uuidv4();
    this.logger = logplease.create(`job/${this.uuid}`);
    this.runtime = runtime;

    this.files = files.map((file, i) => ({
      name: file.name || `file${i}.code`,
      content: file.content,
      encoding: ['base64', 'hex', 'utf8'].includes(file.encoding)
        ? file.encoding
        : 'utf8',
    }));

    this.args = args;
    this.stdin = stdin;
    if (this.stdin.slice(-1) !== '\n') {
      this.stdin += '\n';
    }

    this.timeouts = timeouts;
    this.cpu_times = cpu_times;
    this.memory_limits = memory_limits;

    this.state = job_states.READY;
    this.#dirty_boxes = [];
    this.metrics = new MetricsRecorder(this);
    this.box = null;
  }

  async #create_isolate_box() {
    const box_id = queueManager.getNextBoxId();
    const metadata_file_path = `/tmp/${box_id}-metadata.txt`;

    return new Promise((res, rej) => {
      cp.exec(
        `isolate --init --cg -b${box_id}`,
        (error, stdout, stderr) => {
          if (error) {
            rej(
              `Failed to run isolate --init: ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`
            );
          }
          if (stdout === '') {
            rej('Received empty stdout from isolate --init');
          }
          const box = {
            id: box_id,
            metadata_file_path,
            dir: `${stdout.trim()}/box`,
          };
          this.#dirty_boxes.push(box);
          res(box);
        }
      );
    });
  }

  async prime() {
    this.metrics.startTimer('prime');
    this.metrics.incrementCounter('active_jobs', { state: 'priming' });

    try {
      const queuePromise = queueManager.waitForJobSlot(
        this.uuid,
        this.runtime.language,
        this.runtime.version.raw
      );

      if (queuePromise) {
        this.logger.info(`Awaiting job slot`);
        await queuePromise;
      }

      queueManager.allocateJobSlot(this.uuid);

      this.logger.info(`Priming job`);
      this.logger.debug('Running isolate --init');

      this.box = await this.#create_isolate_box();

      const submission_dir = path.join(this.box.dir, 'submission');
      await fs.mkdir(submission_dir);

      for (const file of this.files) {
        const file_path = path.join(submission_dir, file.name);
        const rel = path.relative(submission_dir, file_path);

        if (rel.startsWith('..')) {
          throw Error(
            `File path "${file.name}" tries to escape parent directory: ${rel}`
          );
        }

        const file_content = Buffer.from(file.content, file.encoding);

        await fs.mkdir(path.dirname(file_path), {
          recursive: true,
          mode: 0o700,
        });
        await fs.write_file(file_path, file_content);
      }

      this.state = job_states.PRIMED;
      this.logger.debug('Primed job');

      this.metrics.recordDuration('prime', 'success');

    } catch (error) {
      this.metrics.recordDuration('prime', 'error');
      throw error;
    } finally {
      this.metrics.decrementCounter('active_jobs', { state: 'priming' });
    }
  }

  async safe_call(file, args, timeout, cpu_time, memory_limit, event_bus = null) {
    const stage = file === 'compile' ? 'compile' : 'run';
    this.metrics.startTimer(stage);

    let stdout = '';
    let stderr = '';
    let output = '';
    let memory = null;
    let code = null;
    let signal = null;
    let message = null;
    let status = null;
    let cpu_time_stat = null;
    let wall_time_stat = null;

    try {
      const proc = cp.spawn(
        ISOLATE_PATH,
        [
          '--run',
          `-b${this.box.id}`,
          `--meta=${this.box.metadata_file_path}`,
          '--cg',
          '-s',
          '-c',
          '/box/submission',
          '-E',
          'HOME=/tmp',
          ...this.runtime.env_vars.flat_map(v => ['-E', v]),
          '-E',
          `PISTON_LANGUAGE=${this.runtime.language}`,
          `--dir=${this.runtime.pkgdir}`,
          `--dir=/etc:noexec`,
          `--processes=${this.runtime.max_process_count}`,
          `--open-files=${this.runtime.max_open_files}`,
          `--fsize=${Math.floor(this.runtime.max_file_size / 1000)}`,
          `--wall-time=${timeout / 1000}`,
          `--time=${cpu_time / 1000}`,
          `--extra-time=0`,
          ...(memory_limit >= 0
            ? [`--cg-mem=${Math.floor(memory_limit / 1000)}`]
            : []),
          ...(config.disable_networking ? [] : ['--share-net']),
          '--',
          '/bin/bash',
          path.join(this.runtime.pkgdir, file),
          ...args,
        ],
        { stdio: 'pipe' }
      );

      if (event_bus === null) {
        proc.stdin.write(this.stdin);
        proc.stdin.end();
        proc.stdin.destroy();
      } else {
        event_bus.on('stdin', data => {
          proc.stdin.write(data);
        });

        event_bus.on('kill', signal => {
          proc.kill(signal);
        });
      }

      proc.stderr.on('data', async data => {
        if (event_bus !== null) {
          event_bus.emit('stderr', data);
        } else if (stderr.length + data.length > this.runtime.output_max_size) {
          message = 'stderr length exceeded';
          status = 'EL';
          this.logger.info(message);
          try {
            process.kill(proc.pid, 'SIGABRT');
          } catch (e) {
            this.logger.debug(`Got error while SIGABRTing process ${proc}:`, e);
          }
        } else {
          stderr += data;
          output += data;
        }
      });

      proc.stdout.on('data', async data => {
        if (event_bus !== null) {
          event_bus.emit('stdout', data);
        } else if (stdout.length + data.length > this.runtime.output_max_size) {
          message = 'stdout length exceeded';
          status = 'OL';
          this.logger.info(message);
          try {
            process.kill(proc.pid, 'SIGABRT');
          } catch (e) {
            this.logger.debug(`Got error while SIGABRTing process ${proc}:`, e);
          }
        } else {
          stdout += data;
          output += data;
        }
      });

      const data = await new Promise((res, rej) => {
        proc.on('exit', (_, signal) => {
          res({ signal });
        });

        proc.on('error', err => {
          rej({ error: err });
        });
      });

      try {
        const metadata_str = (await fs.read_file(this.box.metadata_file_path)).toString();
        const metadata_lines = metadata_str.split('\n');
        for (const line of metadata_lines) {
          if (!line) continue;

          const [key, value] = line.split(':');
          if (key === undefined || value === undefined) {
            throw new Error(`Failed to parse metadata file, received: ${line}`);
          }
          switch (key) {
            case 'cg-mem':
              memory = parseInt(value) * 1000;
              break;
            case 'exitcode':
              code = parseInt(value);
              break;
            case 'exitsig':
              signal = globals.SIGNALS[parseInt(value)] ?? null;
              break;
            case 'message':
              message = message || value;
              break;
            case 'status':
              status = status || value;
              break;
            case 'time':
              cpu_time_stat = parseFloat(value) * 1000;
              break;
            case 'time-wall':
              wall_time_stat = parseFloat(value) * 1000;
              break;
            default:
              break;
          }
        }
      } catch (e) {
        throw new Error(
          `Error reading metadata file: ${this.box.metadata_file_path}\nError: ${e.message}\nIsolate run stdout: ${stdout}\nIsolate run stderr: ${stderr}`
        );
      }

      this.metrics.recordResourceUsage(stage, memory, cpu_time_stat, wall_time_stat);
      this.metrics.recordDuration(stage, status || 'completed');

      return {
        ...data,
        stdout,
        stderr,
        code,
        signal: ['TO', 'OL', 'EL'].includes(status) ? 'SIGKILL' : signal,
        output,
        memory,
        message,
        status,
        cpu_time: cpu_time_stat,
        wall_time: wall_time_stat,
      };

    } catch (error) {
      this.metrics.recordDuration(stage, 'error');
      throw error;
    }
  }

  async execute(event_bus = null) {
    this.metrics.startTimer('total');
    this.metrics.startTimer('execute');
    this.metrics.incrementCounter('active_jobs', { state: 'executing' });
    this.metrics.incrementCounter('executions', { status: 'started' });

    try {
      if (this.state !== job_states.PRIMED) {
        throw new Error('Job must be in primed state, current state: ' + this.state.toString());
      }

      this.logger.info(`Executing job runtime=${this.runtime.toString()}`);
      const code_files = (this.runtime.language === 'file' && this.files) ||
        this.files.filter(file => file.encoding == 'utf8');

      let compile;
      let compile_errored = false;
      const { emit_event_bus_result, emit_event_bus_stage } =
        event_bus === null
          ? {
            emit_event_bus_result: () => { },
            emit_event_bus_stage: () => { },
          }
          : {
            emit_event_bus_result: (stage, result) => {
              const { error, code, signal } = result;
              event_bus.emit('exit', stage, { error, code, signal });
            },
            emit_event_bus_stage: stage => {
              event_bus.emit('stage', stage);
            },
          };

      if (this.runtime.compiled) {
        this.logger.debug('Compiling');
        emit_event_bus_stage('compile');
        compile = await this.safe_call(
          'compile',
          code_files.map(x => x.name),
          this.timeouts.compile,
          this.cpu_times.compile,
          this.memory_limits.compile,
          event_bus
        );
        emit_event_bus_result('compile', compile);
        compile_errored = compile.code !== 0;

        if (!compile_errored) {
          const old_box = this.box;
          this.box = await this.#create_isolate_box();
          await fs.rename(
            path.join(old_box.dir, 'submission'),
            path.join(this.box.dir, 'submission')
          );
        }
      }

      let run;
      if (!compile_errored) {
        this.logger.debug('Running');
        emit_event_bus_stage('run');
        run = await this.safe_call(
          'run',
          [code_files[0].name, ...this.args],
          this.timeouts.run,
          this.cpu_times.run,
          this.memory_limits.run,
          event_bus
        );
        emit_event_bus_result('run', run);
      }

      this.state = job_states.EXECUTED;
      this.metrics.incrementCounter('executions', { status: 'success' });
      this.metrics.recordDuration('execute', 'success');
      this.metrics.recordDuration('total', 'success');
      this.metrics.updateJobsPerSecond('execution');

      return {
        compile,
        run,
        language: this.runtime.language,
        version: this.runtime.version.raw,
      };

    } catch (error) {
      this.metrics.incrementCounter('executions', { status: 'failed' });
      this.metrics.recordDuration('execute', 'error');
      this.metrics.recordDuration('total', 'error');
      throw error;
    } finally {
      this.metrics.decrementCounter('active_jobs', { state: 'executing' });
    }
  }

  async cleanup() {
    this.metrics.startTimer('cleanup');
    this.metrics.incrementCounter('active_jobs', { state: 'cleaning' });

    try {
      this.logger.info(`Cleaning up job`);

      queueManager.releaseJobSlot(this.uuid);
      queueManager.cleanupJobFromQueue(this.uuid);

      await Promise.all(
        this.#dirty_boxes.map(async box => {
          cp.exec(
            `isolate --cleanup --cg -b${box.id}`,
            (error, stdout, stderr) => {
              if (error) {
                this.logger.error(
                  `Failed to run isolate --cleanup: ${error.message} on box #${box.id}\nstdout: ${stdout}\nstderr: ${stderr}`
                );
              }
            }
          );
          try {
            await fs.rm(box.metadata_file_path);
          } catch (e) {
            this.logger.error(
              `Failed to remove the metadata directory of box #${box.id}. Error: ${e.message}`
            );
          }
        })
      );

      this.metrics.recordDuration('cleanup', 'completed');
      this.metrics.updateJobsPerSecond('cleanup');

    } finally {
      this.metrics.decrementCounter('active_jobs', { state: 'cleaning' });
    }
  }
}

module.exports = {
  Job,
  job_states
};
