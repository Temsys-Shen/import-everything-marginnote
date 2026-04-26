var __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon = (function () {
  const TASK_TTL_MS = 30 * 60 * 1000;
  const taskStore = {};

  function nowTimestamp() {
    return Date.now();
  }

  function generateTaskId() {
    const uuidValue = NSUUID.UUID().UUIDString();
    return `mindmap-import-${String(typeof uuidValue === "function" ? uuidValue() : uuidValue)}`;
  }

  function invalidateTimer(timer) {
    if (!timer) {
      return;
    }

    try {
      timer.invalidate();
    } catch (error) {
      console.log(`[ImportEverything] invalidateTimer failed: ${String(error)}`);
    }
  }

  function cleanupTask(taskId, reason) {
    const task = taskStore[taskId];
    if (!task) {
      return;
    }

    invalidateTimer(task._timer);
    task._timer = null;
    task._tick = null;

    if (reason) {
      console.log(`[ImportEverything] Mindmap import task ${taskId} cleaned: ${reason}`);
    }
  }

  function pruneExpiredTasks() {
    const now = nowTimestamp();
    Object.keys(taskStore).forEach(function (taskId) {
      const task = taskStore[taskId];
      if (!task) {
        return;
      }

      if (task.phase === "import") {
        return;
      }

      if (now - task.updatedAt > TASK_TTL_MS) {
        cleanupTask(taskId, "expired");
        delete taskStore[taskId];
      }
    });
  }

  function getTaskOrThrow(taskId) {
    pruneExpiredTasks();
    const normalizedTaskId = String(taskId || "");
    const task = taskStore[normalizedTaskId];
    if (!task) {
      throw new Error(`Mindmap import task not found: ${normalizedTaskId}`);
    }
    return task;
  }

  function toPublicTask(task) {
    return {
      taskId: task.taskId,
      phase: task.phase,
      current: task.current,
      total: task.total,
      message: task.message,
      error: task.error,
      resultReady: task.resultReady,
      createdCount: task.createdCount,
      finishedSheetCount: task.finishedSheetCount,
      currentSheetTitle: task.currentSheetTitle,
      currentSheetIndex: task.currentSheetIndex,
    };
  }

  function createTask(initialData) {
    pruneExpiredTasks();

    const taskId = generateTaskId();
    const task = {
      taskId: taskId,
      phase: "import",
      current: Number(initialData.current || 0),
      total: Number(initialData.total || 0),
      message: String(initialData.message || ""),
      error: "",
      resultReady: false,
      createdCount: 0,
      finishedSheetCount: 0,
      currentSheetTitle: String(initialData.currentSheetTitle || ""),
      currentSheetIndex: Number.isFinite(initialData.currentSheetIndex) ? initialData.currentSheetIndex : -1,
      result: null,
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
      _timer: null,
      _tick: null,
    };

    taskStore[taskId] = task;
    return toPublicTask(task);
  }

  function updateTask(taskId, patch) {
    const task = getTaskOrThrow(taskId);
    Object.keys(patch || {}).forEach(function (key) {
      task[key] = patch[key];
    });
    task.updatedAt = nowTimestamp();
    return toPublicTask(task);
  }

  function completeTask(taskId, result, message) {
    const task = getTaskOrThrow(taskId);
    task.phase = "done";
    task.current = task.total;
    task.message = String(message || task.message || "脑图导入完成");
    task.error = "";
    task.resultReady = true;
    task.result = result === undefined ? null : result;
    task.updatedAt = nowTimestamp();
    cleanupTask(taskId, "completed");
    return toPublicTask(task);
  }

  function failTask(taskId, error) {
    const task = getTaskOrThrow(taskId);
    task.phase = "error";
    task.error = error && error.message ? error.message : String(error);
    task.message = task.error;
    task.resultReady = false;
    task.updatedAt = nowTimestamp();
    cleanupTask(taskId, "failed");
    return toPublicTask(task);
  }

  function startTask(taskId, tick) {
    const task = getTaskOrThrow(taskId);
    if (task._timer) {
      throw new Error(`Mindmap import task already started: ${taskId}`);
    }

    task._tick = tick;
    task.updatedAt = nowTimestamp();

    const timer = NSTimer.scheduledTimerWithTimeInterval(0.01, true, function () {
      const liveTask = taskStore[taskId];
      if (!liveTask) {
        invalidateTimer(timer);
        return;
      }

      if (liveTask.phase !== "import") {
        invalidateTimer(timer);
        liveTask._timer = null;
        liveTask._tick = null;
        return;
      }

      try {
        tick(liveTask);
        liveTask.updatedAt = nowTimestamp();
      } catch (error) {
        failTask(taskId, error);
      }
    });

    task._timer = timer;
    return toPublicTask(task);
  }

  function getTaskProgress(taskId) {
    const task = getTaskOrThrow(taskId);
    return toPublicTask(task);
  }

  function getTaskResult(taskId) {
    const task = getTaskOrThrow(taskId);
    if (!task.resultReady) {
      throw new Error(`Mindmap import result is not ready: ${taskId}`);
    }
    return task.result;
  }

  return {
    createTask: createTask,
    updateTask: updateTask,
    completeTask: completeTask,
    failTask: failTask,
    startTask: startTask,
    getTaskProgress: getTaskProgress,
    getTaskResult: getTaskResult,
  };
})();
