const config = require('./config');
const { jobMetrics, queueMetrics } = require('./metrics');

class QueueManager {
  constructor(maxConcurrentJobs) {
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.remainingJobSpaces = maxConcurrentJobs;
    this.jobQueue = [];
    this.boxId = 0;
    this.MAX_BOX_ID = 999;
    this.activeJobs = new Set();
    this.updateQueueMetrics();
    jobMetrics.isolateBoxesInUse.set(0);
  }

  getNextBoxId() {
    this.boxId = (this.boxId + 1) % this.MAX_BOX_ID;
    jobMetrics.isolateBoxesInUse.set(this.boxId);
    return this.boxId;
  }

  async waitForJobSlot(jobId, language, version) {
    if (this.remainingJobSpaces < 1) {
      queueMetrics.startQueueTimer(jobId, language, version);
      return new Promise(resolve => {
        this.jobQueue.push({ resolve, jobId });
        this.updateQueueMetrics();
      });
    }
    return null;
  }

  allocateJobSlot(jobId) {
    if (this.remainingJobSpaces > 0) {
      this.remainingJobSpaces--;
      this.activeJobs.add(jobId);
      this.updateJobStateMetrics();
      queueMetrics.endQueueTimer(jobId);
      return true;
    }
    return false;
  }

  releaseJobSlot(jobId) {
    this.remainingJobSpaces++;
    this.activeJobs.delete(jobId);
    this.updateJobStateMetrics();
    if (this.jobQueue.length > 0) {
      const nextJob = this.jobQueue.shift();
      this.updateQueueMetrics();
      nextJob.resolve();
    }
  }

  updateQueueMetrics() {
    queueMetrics.updateQueueLength(this.jobQueue.length);

    jobMetrics.activeJobs.set({ language: '', version: '', state: 'queued' }, this.jobQueue.length);
    jobMetrics.activeJobs.set({ language: '', version: '', state: 'available' }, this.remainingJobSpaces);
  }

  updateJobStateMetrics() {
    jobMetrics.activeJobs.set({ language: '', version: '', state: 'active' }, this.activeJobs.size);
  }

  getQueueStats() {
    return {
      queueLength: this.jobQueue.length,
      activeJobs: this.activeJobs.size,
      availableSlots: this.remainingJobSpaces,
      maxConcurrentJobs: this.maxConcurrentJobs
    };
  }

  cleanupJobFromQueue(jobId) {
    const index = this.jobQueue.findIndex(item => item.jobId === jobId);
    if (index > -1) {
      this.jobQueue.splice(index, 1);
      this.updateQueueMetrics();
      queueMetrics.endQueueTimer(jobId);
    }
  }

  updateJobsPerSecond(operation, count) {
    jobMetrics.jobsPerSecond.set({ operation }, count);
  }
}

const queueManager = new QueueManager(config.max_concurrent_jobs || 10);

module.exports = queueManager;
