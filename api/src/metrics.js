const promClient = require('prom-client');

if (global.prometheusMetricsInitialized) {
  module.exports = global.prometheusMetrics;
} else {
  promClient.register.clear();

  const collectDefaultMetrics = promClient.collectDefaultMetrics;
  collectDefaultMetrics({ timeout: 5000 });

  const jobMetrics = {
    jobDuration: new promClient.Histogram({
      name: 'compiler_execution_duration_seconds',
      help: 'Duration of job execution in seconds',
      labelNames: ['language', 'version', 'stage', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    }),

    jobMemoryUsage: new promClient.Gauge({
      name: 'compiler_job_memory_bytes',
      help: 'Memory usage of jobs in bytes',
      labelNames: ['language', 'version', 'stage', 'job_id', 'type']
    }),

    compilerMemoryUsage: new promClient.Gauge({
      name: 'compiler_memory_bytes',
      help: 'Memory usage of compiler processes in bytes',
      labelNames: ['language', 'version', 'job_id']
    }),

    jobCpuTime: new promClient.Gauge({
      name: 'compiler_cpu_time_seconds',
      help: 'CPU time used by jobs in seconds',
      labelNames: ['language', 'version', 'stage', 'job_id']
    }),

    jobWallTime: new promClient.Gauge({
      name: 'compiler_wall_time_seconds',
      help: 'Wall clock time for jobs in seconds',
      labelNames: ['language', 'version', 'stage', 'job_id']
    }),

    activeJobs: new promClient.Gauge({
      name: 'active_jobs',
      help: 'Number of currently active jobs',
      labelNames: ['language', 'version', 'state']
    }),

    jobQueueLength: new promClient.Gauge({
      name: 'compiler_queue_length',
      help: 'Number of jobs waiting in queue'
    }),

    jobQueueWaitTime: new promClient.Histogram({
      name: 'compiler_queue_wait_time_seconds',
      help: 'Time jobs spend waiting in queue',
      labelNames: ['language', 'version'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    }),

    jobExecutions: new promClient.Counter({
      name: 'compiler_executions_total',
      help: 'Total number of job executions',
      labelNames: ['language', 'version', 'status']
    }),

    jobsPerSecond: new promClient.Gauge({
      name: 'jobs_per_second',
      help: 'Current job processing rate',
      labelNames: ['operation']
    }),

    isolateBoxesInUse: new promClient.Gauge({
      name: 'isolate_boxes_in_use',
      help: 'Number of isolate boxes currently in use'
    })
  };

  const queueMetrics = {
    queueStartTimes: new Map(),

    startQueueTimer(jobId, language, version) {
      this.queueStartTimes.set(jobId, {
        startTime: Date.now(),
        language,
        version
      });
    },

    endQueueTimer(jobId) {
      const timer = this.queueStartTimes.get(jobId);
      if (timer) {
        const waitTime = (Date.now() - timer.startTime) / 1000;
        jobMetrics.jobQueueWaitTime.observe(
          { language: timer.language, version: timer.version },
          waitTime
        );
        this.queueStartTimes.delete(jobId);
      }
    },

    updateQueueLength(queueLength) {
      jobMetrics.jobQueueLength.set(queueLength);
    },

    cleanupJobMetrics(jobId, language, version) {
      jobMetrics.jobMemoryUsage.remove(
        { language: language, version: version, stage: 'compile', job_id: jobId, type: 'execution' }
      );
      jobMetrics.jobMemoryUsage.remove(
        { language: language, version: version, stage: 'run', job_id: jobId, type: 'execution' }
      );
      jobMetrics.compilerMemoryUsage.remove(
        { language: language, version: version, job_id: jobId }
      );
      jobMetrics.jobCpuTime.remove(
        { language: language, version: version, stage: 'compile', job_id: jobId }
      );
      jobMetrics.jobCpuTime.remove(
        { language: language, version: version, stage: 'run', job_id: jobId }
      );
      jobMetrics.jobWallTime.remove(
        { language: language, version: version, stage: 'compile', job_id: jobId }
      );
      jobMetrics.jobWallTime.remove(
        { language: language, version: version, stage: 'run', job_id: jobId }
      );
    }
  };

  global.prometheusMetricsInitialized = true;
  global.prometheusMetrics = { jobMetrics, queueMetrics };

  module.exports = global.prometheusMetrics;
}
