const {ipcRenderer} = require('electron');
const Range = require('ace/range').Range;
const editor = ace.edit('source');
let stackFrameMarker;
let scopeMarker;
let anonFrameDepth = 0;
let scriptId = -1;
let scriptSource = '';

function setupDropbox () {

  let dropbox = document.getElementById('dropbox');

  dropbox.ondragover = () => {
    return false;
  };
  dropbox.ondragleave = () => {
    return false;
  };

  dropbox.ondragend = () => {
    return false;
  };

  dropbox.ondrop = (e) => {
    e.preventDefault();

    for (let f of e.dataTransfer.files) {
      console.log('File(s) you dragged here: ', f.path);
    }

    ipcRenderer.send('startDebugger', {filePath: e.dataTransfer.files[0].path});

    return false;
  };

}

function setupIpcEvents () {
  ipcRenderer.on('inspectorEvent', (sender, args) => {
    console.log(args);
    if (args.method === 'Debugger.paused') {
      if (scriptId == -1) {
        scriptId = args.params.callFrames[0].location.scriptId;
        ipcRenderer.once('inspectorMethod', (sender, args) => {
          //console.log(args);
          if (typeof args.scriptSource !== 'undefined') {
            scriptSource = args.scriptSource.slice(62, -3);
            editor.setValue(scriptSource);
            editor.navigateFileEnd();
          }
        });
        ipcRenderer.send('inspectorMethod', {method: 'Debugger.getScriptSource', params: {scriptId: scriptId}});
      }
      if (args.params.callFrames[0].location.scriptId == scriptId) {
        let callFrames = args.params.callFrames;
        for (let i = 0; i < callFrames.length; i++) {
          if (callFrames[i].functionName.length == 0) {
            if (i > anonFrameDepth) {
              // New function call
              console.log('inside new function');
            }
            else if (i < anonFrameDepth) {
              // Current function returned
              console.log('function just returned');
            }
            anonFrameDepth = i;
            break;
          }
        }
        hightlightStackFrame(callFrames[0]);
      }
      else {
        console.log('external script');
        ipcRenderer.send('inspectorMethod', {method: 'Debugger.stepOut', params: {}});
      }
    }
    else if (args.method === 'Runtime.executionContextDestroyed') {
      console.log('done!');
      ipcRenderer.send('close');
    }
  });
}

function transformLocation (location) {
  if (location.lineNumber == 0) {
    location.columnNumber -= 62;
  }
  return location;
}

function hightlightStackFrame (stackFrame) {
  if (typeof stackFrameMarker !== 'undefined') {
    editor.getSession().removeMarker(stackFrameMarker);
  }
  if (typeof scopeMarker !== 'undefined') {
    editor.getSession().removeMarker(scopeMarker);
  }
  let transformedLocation = transformLocation(stackFrame.location);
  let range = new Range(transformedLocation.lineNumber, transformedLocation.columnNumber, transformedLocation.lineNumber, transformedLocation.columnNumber + 1);
  stackFrameMarker = editor.getSession().addMarker(range, 'highlight', 'background');

  let transformedStartLocation = transformLocation(stackFrame.scopeChain[0].startLocation);
  let transformedEndLocation = transformLocation(stackFrame.scopeChain[0].endLocation);
  range = new Range(transformedStartLocation.lineNumber, transformedStartLocation.columnNumber, transformedEndLocation.lineNumber, transformedEndLocation.columnNumber);
  scopeMarker = editor.getSession().addMarker(range, 'highlightScope', 'background');
}

function setupAce () {
  editor.getSession().setMode('ace/mode/javascript');
  editor.setFontSize(16);
  editor.setValue('');
}

setupIpcEvents();
setupDropbox();
setupAce();