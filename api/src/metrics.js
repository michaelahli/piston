const promClient = require('prom-client');
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
    name: 'compiler_memory_bytes',
    help: 'Memory usage of jobs in bytes',
    labelNames: ['language', 'version', 'stage', 'job_id']
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
    labelNames: ['state']
  }),

  jobQueueLength: new promClient.Gauge({
    name: 'compiler_queue_length',
    help: 'Number of jobs waiting in queue'
  }),

  jobExecutions: new promClient.Counter({
    name: 'compiler_executions_total',
    help: 'Total number of job executions',
    labelNames: ['language', 'version', 'status']
  })
};

module.exports = {
  jobMetrics,
};
