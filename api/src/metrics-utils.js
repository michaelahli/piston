const { jobMetrics, queueMetrics } = require('./metrics');
const queueManager = require('./queue-manager');

class MetricsRecorder {
  constructor(job) {
    this.job = job;
    this.uuid = job.uuid;
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
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000;
      jobMetrics.jobDuration.observe(
        {
          language: this.language,
          version: this.version,
          stage: stage,
          status: status
        },
        duration
      );
      this.startTimes.delete(stage);
    }
  }

  recordResourceUsage(stage, memory, cpuTime, wallTime) {
    if (memory !== null) {
      jobMetrics.jobMemoryUsage.set(
        {
          language: this.language,
          version: this.version,
          stage: stage,
          job_id: this.uuid,
          type: 'execution'
        },
        memory
      );

      if (stage === 'compile') {
        jobMetrics.compilerMemoryUsage.set(
          {
            language: this.language,
            version: this.version,
            job_id: this.uuid
          },
          memory
        );
      }
    }

    if (cpuTime !== null) {
      jobMetrics.jobCpuTime.set(
        {
          language: this.language,
          version: this.version,
          stage: stage,
          job_id: this.uuid
        },
        cpuTime / 1000
      );
    }

    if (wallTime !== null) {
      jobMetrics.jobWallTime.set(
        {
          language: this.language,
          version: this.version,
          stage: stage,
          job_id: this.uuid
        },
        wallTime / 1000
      );
    }
  }

  incrementCounter(metricName, labels = {}) {
    switch (metricName) {
      case 'executions':
        jobMetrics.jobExecutions.inc({
          language: this.language,
          version: this.version,
          status: labels.status || 'started'
        });
        break;
      case 'active_jobs':
        // activeJobs now has ['language', 'version', 'state'] labels
        jobMetrics.activeJobs.inc({
          language: this.language,
          version: this.version,
          state: labels.state
        });
        break;
    }
  }

  decrementCounter(metricName, labels = {}) {
    switch (metricName) {
      case 'active_jobs':
        // activeJobs now has ['language', 'version', 'state'] labels
        jobMetrics.activeJobs.dec({
          language: this.language,
          version: this.version,
          state: labels.state
        });
        break;
    }
  }

  updateJobsPerSecond(operation) {
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - this.jobStartTime) / 1000;
    if (elapsedSeconds > 0) {
      const rate = 1 / elapsedSeconds;
      queueManager.updateJobsPerSecond(operation, rate);
    }
  }

  cleanup() {
    queueMetrics.cleanupJobMetrics(this.uuid, this.language, this.version);
  }
}

module.exports = {
  MetricsRecorder
};
