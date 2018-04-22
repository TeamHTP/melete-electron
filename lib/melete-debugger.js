const CDP = require('chrome-remote-interface');
const {ipcMain} = require('electron');

module.exports = class MeleteDebugger {

  constructor(win, wsUrl) {
    this.win = win;
    this.wsUrl = wsUrl;
    this.autoStep = false;
    this.autoStepIntervalId = null;
    this.stepIntervalMs = 1000;

    ipcMain.on('step', (event, arg) => {
      this.debuggerClient.Debugger.stepInto({}, (error, response) => {
        //console.log(response);
      });
      event.sender.send('step', '');
    });

    ipcMain.on('startAutoStep', (event, arg) => {
      this.startAutoStep(arg.intervalMs);
      event.sender.send('startAutoStep', '');
    });

    ipcMain.on('stopAutoStep', (event, arg) => {
      this.stopAutoStep();
      event.sender.send('stopAutoStep', '');
    });

    ipcMain.on('inspectorMethod', (event, arg) => {
      this.debuggerClient.send(arg.method, arg.params, (error, response) => {
        event.sender.send('inspectorMethod', response);
      });
    });

    ipcMain.on('run', (event, arg) => {
      this.run();
      event.sender.send('run', '');
    });

    ipcMain.on('close', (event, arg) => {
      this.debuggerClient.close(() => {
        event.sender.send('close', '');
      });
      ipcMain.removeAllListeners('inspectorMethod');
    });

  }

  attach() {
    CDP({target: this.wsUrl, local: true}, (client) => {
      this.debuggerClient = client;
      this.debuggerClient.on('event', (message) => {
        this.win.webContents.send('inspectorEvent', message);
        /*if (message.method === 'Debugger.paused') {
          console.log(message.params.callFrames[0]);
        }*/
      });
      this.debuggerClient.Profiler.enable();
      this.debuggerClient.Runtime.enable();
      this.debuggerClient.Debugger.enable();
      this.debuggerClient.Debugger.setPauseOnExceptions({state: 'none'});
      this.debuggerClient.Debugger.setAsyncCallStackDepth({maxDepth: 32});
      this.debuggerClient.Debugger.setBlackboxPatterns({patterns: []});
      this.debuggerClient.Runtime.runIfWaitingForDebugger();
      this.attatched = true;
      //this.startAutoStep(1000);
      this.win.webContents.send('inspectorReady', {});
    }).on('error', (err) => {
      // cannot connect to the remote endpoint
      console.error(err);
    });
  }

  startAutoStep(intervalMs) {
    if (this.autoStep) {
      return;
    }
    this.autoStep = true;
    this.stepIntervalMs = intervalMs;
    this.autoStepIntervalId = setInterval(() => {
      if (!this.autoStep) {
        clearInterval(this.autoStepIntervalId);
        this.autoStepIntervalId = null;
        return;
      }

      this.debuggerClient.Debugger.stepInto({}, (error, response) => {
        //console.log(response);
      });
    }, intervalMs);
  }

  stopAutoStep() {
    this.autoStep = false;
  }

  run() {
    this.debuggerClient.Debugger.resume();
  }

}
