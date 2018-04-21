const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

const MeleteDebugger = require('./lib/melete-debugger.js');

const {spawn} = require('child_process');

let inspector;
let debuggerUrl;
let win;

function createWindow () {
  win = new BrowserWindow({width: 800, height: 600});

  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  win.webContents.openDevTools();

  ipcMain.on('writeTempFile', (event, args) => {
    fs.writeFile('temp.js', args.code, (err) => {
      if (err)
        event.sender.send('writeTempFile', err);
      event.sender.send('writeTempFile', {path: 'temp.js'});
    });
  });

  ipcMain.on('startDebugger', (event, args) => {
    createInspectorProcess(args.filePath);
    event.sender.send('startDebugger', '');
  });

  //createInspectorProcess('./res/samples/merge_sort.js');

  win.on('closed', () => {
    win = null;
  });
}

function createInspectorProcess (file) {
  inspector = spawn('node', ['--inspect-brk', file]);

  inspector.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  inspector.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
    let line = data.toString('utf-8');
    if (line.startsWith('Debugger listening on ')) {
      debuggerUrl = line.match(/ws:\/\/.+?:.+?\/.{36}/g)[0];
      console.log(debuggerUrl);
      let meleteDebugger = new MeleteDebugger(win, debuggerUrl);
      meleteDebugger.attach();
    }
  });

  inspector.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
