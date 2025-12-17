const { jobMetrics } = require('./metrics');
const queueManager = require('./queue-manager');

class MetricsRecorder {
  constructor(job) {
    this.language = job.runtime.language;
    this.version = job.runtime.version.raw;
    this.startTimes = new Map();
    this.jobStartTime = Date.now();
  }

  startTimer(stage) {
    this.startTimes.set(stage, Date.now());
  }

  recordDuration(stage, status = 'completed') {
    const startTime = this.startTimes.get(stage);
    if (!startTime) return;

    const duration = (Date.now() - startTime) / 1000;
    jobMetrics.jobDuration.observe(
      { language: this.language, version: this.version, stage, status },
      duration
    );

    this.startTimes.delete(stage);
  }

  recordResourceUsage(stage, memory, cpuTime, wallTime) {
    if (memory !== null) {
      jobMetrics.jobMemoryUsage.set(
        { language: this.language, version: this.version, stage, type: 'execution' },
        memory
      );

      if (stage === 'compile') {
        jobMetrics.compilerMemoryUsage.set(
          { language: this.language, version: this.version },
          memory
        );
      }
    }

    if (cpuTime !== null) {
      jobMetrics.jobCpuTime.set(
        { language: this.language, version: this.version, stage },
        cpuTime / 1000
      );
    }

    if (wallTime !== null) {
      jobMetrics.jobWallTime.set(
        { language: this.language, version: this.version, stage },
        wallTime / 1000
      );
    }
  }

  incrementCounter(metricName, labels = {}) {
    if (metricName === 'executions') {
      jobMetrics.jobExecutions.inc({
        language: this.language,
        version: this.version,
        status: labels.status || 'started'
      });
    }

    if (metricName === 'active_jobs') {
      jobMetrics.activeJobs.inc({
        language: this.language,
        version: this.version,
        state: labels.state
      });
    }
  }

  decrementCounter(metricName, labels = {}) {
    if (metricName === 'active_jobs') {
      jobMetrics.activeJobs.dec({
        language: this.language,
        version: this.version,
        state: labels.state
      });
    }
  }

  updateJobsPerSecond(operation) {
    const elapsed = (Date.now() - this.jobStartTime) / 1000;
    if (elapsed > 0) {
      queueManager.updateJobsPerSecond(operation, 1 / elapsed);
    }
  }
}

module.exports = { MetricsRecorder };
