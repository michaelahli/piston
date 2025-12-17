const config = require('./config');
const { jobMetrics, queueMetrics } = require('./metrics');

class QueueManager {
  constructor(maxConcurrentJobs) {
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.remainingJobSpaces = maxConcurrentJobs;
    this.jobQueue = [];
    this.activeJobs = new Set();

    this.boxId = 0;
    this.MAX_BOX_ID = 999;

    this.updateAllMetrics();
  }

  getNextBoxId() {
    this.boxId = (this.boxId + 1) % this.MAX_BOX_ID;
    return this.boxId;
  }

  async waitForJobSlot(jobId, language, version) {
    if (this.remainingJobSpaces < 1) {
      queueMetrics.startQueueTimer(jobId, language, version);
      return new Promise(resolve => {
        this.jobQueue.push({ resolve, jobId });
        this.updateAllMetrics();
      });
    }
    return null;
  }

  allocateJobSlot(jobId) {
    if (this.remainingJobSpaces < 1) return false;

    this.remainingJobSpaces--;
    this.activeJobs.add(jobId);

    this.updateAllMetrics();
    queueMetrics.endQueueTimer(jobId);
    return true;
  }

  releaseJobSlot(jobId) {
    this.remainingJobSpaces++;
    this.activeJobs.delete(jobId);

    if (this.jobQueue.length > 0) {
      const next = this.jobQueue.shift();
      next.resolve();
    }

    this.updateAllMetrics();
  }

  updateAllMetrics() {
    jobMetrics.jobQueueLength.set(this.jobQueue.length);

    jobMetrics.activeJobs.set({ language: '', version: '', state: 'queued' }, this.jobQueue.length);
    jobMetrics.activeJobs.set({ language: '', version: '', state: 'active' }, this.activeJobs.size);
    jobMetrics.activeJobs.set(
      { language: '', version: '', state: 'available' },
      this.remainingJobSpaces
    );

    // 🔥 metric SEMANTIC BENER
    jobMetrics.isolateBoxesInUse.set(this.activeJobs.size);
  }

  updateJobsPerSecond(operation, rate) {
    jobMetrics.jobsPerSecond.set({ operation }, rate);
  }
}

module.exports = new QueueManager(config.max_concurrent_jobs || 10);
