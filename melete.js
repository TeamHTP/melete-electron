const {ipcRenderer} = require('electron');
const Range = require('ace/range').Range;
const editor = ace.edit('source');
let editors = [editor];
let stackFrameMarker;
let scopeMarker;
let anonFrameDepth = 0;
let scriptId = -1;
let scriptSource = '';
let removeBubbleFlag = false;
let colors = [];
let left;
let started = false;
let run = false;

function setupDropbox () {

  let dropbox = document.getElementById('source');

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
    let f = e.dataTransfer.files[0];

    var fileReader = new FileReader();
    fileReader.readAsText(f);
    fileReader.onload = function(e) {
      editor.setValue(e.target.result);
    }

    //ipcRenderer.send('startDebugger', {filePath: e.dataTransfer.files[0].path});
    //editor.setReadOnly(true);

    return false;
  };

}

function getSpeedSliderMs () {
  return 9500 - (($('#speed').val()) / 100) * 9000;
}

function setupControls () {
  $('#pause').prop('disabled', true);
  $('#stop').prop('disabled', true);

  $('#run').click(() => {
    if (!started) {
      editor.setReadOnly(true);
      ipcRenderer.once('writeTempFile', (sender, args) => {
        if (typeof args.path !== 'undefined') {
          ipcRenderer.once('inspectorReady', (sender, args) => {
            ipcRenderer.send('run', {});
            ipcRenderer.send('run', {});
          });
          ipcRenderer.send('startDebugger', {filePath: args.path});
        }
      });
      ipcRenderer.send('writeTempFile', {code: editor.getSession().getDocument().getValue()});
      started = true;
      run = true;
      $('#start').prop('disabled', true);
      $('#pause').prop('disabled', true);
      $('#step').prop('disabled', true);
      $('#run').prop('disabled', true);
      $('#stop').prop('disabled', false);
    }
    else {
      ipcRenderer.send('run', {});
    }
  });

  $('#start').click(() => {
    if (started) {
      ipcRenderer.send('startAutoStep', {intervalMs: getSpeedSliderMs()});
      $('#start').prop('disabled', true);
      $('#pause').prop('disabled', false);
    }
    else {
      editor.setReadOnly(true);
      ipcRenderer.once('writeTempFile', (sender, args) => {
        if (typeof args.path !== 'undefined') {
          ipcRenderer.once('inspectorReady', (sender, args) => {
            ipcRenderer.send('startAutoStep', {intervalMs: getSpeedSliderMs()});
          });
          ipcRenderer.send('startDebugger', {filePath: args.path});
        }
      });
      ipcRenderer.send('writeTempFile', {code: editor.getSession().getDocument().getValue()});
      scriptSource = editor.getSession().getDocument().getValue();
      $('#start').prop('disabled', true);
      $('#pause').prop('disabled', false);
      $('#step').prop('disabled', false);
      $('#run').prop('disabled', true);
      started = true;
    }
    $('#stop').prop('disabled', false);
    $('#speed').prop('disabled', true);
  });

  $('#stop').click(() => {
    started = false;
    run = false;
    ipcRenderer.once('stopDebugger', (sender, args) => {
      console.log(args);
      reset();
    });
    ipcRenderer.send('stopDebugger');
  });

  $('#pause').click(() => {
    ipcRenderer.send('stopAutoStep', {});
    $('#start').prop('disabled', false);
    $('#pause').prop('disabled', true);
    $('#step').prop('disabled', false);
    $('#speed').prop('disabled', false);
  });

  $('#step').click(() => {
    if (started) {
      ipcRenderer.send('step', {});
    }
    else {
      editor.setReadOnly(true);
      ipcRenderer.once('writeTempFile', (sender, args) => {
        if (typeof args.path !== 'undefined') {
          ipcRenderer.once('inspectorEvent', (sender, args) => {
            ipcRenderer.send('stopAutoStep', {});
          });
          ipcRenderer.send('startDebugger', {filePath: args.path});
        }
      });
      ipcRenderer.send('writeTempFile', {code: editor.getSession().getDocument().getValue()});
      $('#start').prop('disabled', false);
      $('#pause').prop('disabled', true);
      $('#stop').prop('disabled', false);
      started = true;
    }
  });
}

function setupIpcEvents () {
  ipcRenderer.on('inspectorEvent', (sender, args) => {
    console.log(args);
    if (args.method === 'Debugger.paused') {
      if (run) {
        ipcRenderer.send('run', {});
      }
      if (scriptId == -1) {
        scriptId = args.params.callFrames[0].location.scriptId;
        ipcRenderer.once('inspectorMethod', (sender, args) => {
          console.log(args);
          if (typeof args.scriptSource !== 'undefined') {
            scriptSource = args.scriptSource.slice(62, -3);
            editor.setValue(scriptSource);
            editor.navigateFileEnd();
          }
        });
        ipcRenderer.send('inspectorMethod', {method: 'Debugger.getScriptSource', params: {scriptId: scriptId}});
      }
      if (args.params.callFrames[0].location.scriptId == scriptId) {
        if (removeBubbleFlag) {
          $('#scope-sources .scope-source').last().remove();
          removeBubbleFlag = false;
        }
        let callFrames = args.params.callFrames;
        for (let i = callFrames.length - 1; i >= 0; i--) {
          if (callFrames[i].functionName.length == 0) {
            if (i > anonFrameDepth) {
              // New function call
              console.log('inside new function');
              $('#scope-sources').append(`<div class="scope-source card animated fadeInUp" id="source-${editors.length}"></div>`);
              editors.push(ace.edit(`source-${editors.length}`));
              setupAce(editors[editors.length - 1]);
              let range = getScopeRange(callFrames[0]);
              editors[editors.length - 1].startOffset = range.start;
              editors[editors.length - 1].setValue(editor.getSession().getDocument().getTextRange(range));
              editors[editors.length - 1].navigateFileEnd();
              editors[editors.length - 1].scrollToLine(getScopeRange(callFrames[0]).start.row, true, true);
              editors[editors.length - 1].setReadOnly(true);

              editors[editors.length - 1].setOptions({
                maxLines: 10,
                minLines: 10
              });

              left = (editors.length - 4) * $('#scope-sources .scope-source').last().outerWidth(true);
              //$('#scope-sources').scrollLeft(left);
              $('#scope-sources').animate({
                scrollLeft: left
              }, 500);
            }
            else {
              if (i < anonFrameDepth) {
                // Current function returned
                console.log('function just returned');
                $('#scope-sources .scope-source').last().removeClass('fadeInUp');
                $('#scope-sources .scope-source').last().addClass('fadeOutUp');
                left -= $('#scope-sources .scope-source').last().outerWidth(true);
                $('#scope-sources').animate({
                  scrollLeft: left
                }, 500);
                removeBubbleFlag = true;
                editors.pop();
              }
              if (typeof editors[editors.length - 1].stackFrameMarker !== 'undefined') {
                editors[editors.length - 1].getSession().removeMarker(editors[editors.length - 1].stackFrameMarker);
              }
              if (typeof editors[editors.length - 1].scopeMarker !== 'undefined') {
                editors[editors.length - 1].getSession().removeMarker(editors[editors.length - 1].scopeMarker);
              }
            }
            anonFrameDepth = i;
            break;
          }
        }
        hightlightStackFrame(callFrames[0]);
        ipcRenderer.once('inspectorMethod', (sender, args) => {
          console.log(args);
          if (typeof args.result !== 'undefined')
            renderVarTable(args.result);
        });
        ipcRenderer.send('inspectorMethod', {method: 'Runtime.getProperties', params: {objectId: callFrames[0].scopeChain[0].object.objectId, generatePreview: true}});
      }
      else {
        console.log('external script');
        ipcRenderer.once('inspectorMethod', (sender, args) => {
          console.log(args);
        });
        ipcRenderer.send('inspectorMethod', {method: 'Debugger.stepOut', params: {}});
      }
    }
    else if (args.method === 'Runtime.exceptionThrown') {
      writeToConsole(args.params.exceptionDetails.exception.description);
    }
    else if (args.method === 'Runtime.executionContextDestroyed') {
      ipcRenderer.send('close');
      reset();
    }
  });

  ipcRenderer.on('stdout', (sender, data) => {
    writeToConsole(data.toString('utf-8'));
  });
}

function reset() {
  console.log('done!');
  while (editors.length > 1) {
    $('#scope-sources .scope-source').last().remove();
    editors.pop();
  }

  if (typeof editors[editors.length - 1].stackFrameMarker !== 'undefined') {
    editors[editors.length - 1].getSession().removeMarker(editors[editors.length - 1].stackFrameMarker);
  }
  if (typeof editors[editors.length - 1].scopeMarker !== 'undefined') {
    editors[editors.length - 1].getSession().removeMarker(editors[editors.length - 1].scopeMarker);
  }
  editor.setReadOnly(false);
  started = false;
  anonFrameDepth = 0;
  run = false;
  $('#start').prop('disabled', false);
  $('#pause').prop('disabled', true);
  $('#run').prop('disabled', false);
  $('#step').prop('disabled', false);
  $('#stop').prop('disabled', true);
  scriptId == -1;
  ipcRenderer.removeAllListeners('inspectorMethod');
}

function renderVarTable (objects) {
  $('#vars-tbody').html('');
  for (let o of objects) {
    let val = o.value.value;
    if (o.value.type === 'object') {
      if (o.value.subtype === 'array') {
        val = [];
        for (let i of o.value.preview.properties) {
          if (i.type === 'number') {
            val.push(Number(i.value));
          }
          else {
            val.push(i.value);
          }
        }
      }
      else {
        val = {};
        for (let k in o.value.preview.properties) {
          if (o.value.preview.properties[k].type === 'number') {
            val[k] = Number(o.value.preview.properties[k].value);
          }
          else {
            val[k] = o.value.preview.properties[k].value;
          }
        }
      }
      val = JSON.stringify(val);
    }
    $('#vars-tbody').append(`<tr><td>${o.name}</td><td>${o.value.type}</td><td>${val}</td></tr>`);
  }
}

function writeToConsole (message) {
  $('#console').append(message.replace(/\n/g, '<br/>'));
  $('#console').scrollTop(document.getElementById('console').scrollHeight);
}

function transformLocation (location) {
  if (location.lineNumber == 0) {
    location.columnNumber -= 62;
  }
  return location;
}

function getScopeRange (stackFrame) {
  let transformedStartLocation = transformLocation(stackFrame.scopeChain[0].startLocation);
  let transformedEndLocation = transformLocation(stackFrame.scopeChain[0].endLocation);
  let sourceStartLine = scriptSource.split('\n')[transformedStartLocation.lineNumber];
  let col = transformedStartLocation.columnNumber - 1;
  for (let i = col; i >= 0; i--) {
    if (sourceStartLine[i] == ';' || sourceStartLine[i] == '{' || sourceStartLine[i] == '}' || sourceStartLine[i] == '(' || sourceStartLine[i] == ')') {
      col = i + 1;
      break;
    }
    col = i;
  }
  sourceStartLine = sourceStartLine.substr(col);
  return new Range(transformedStartLocation.lineNumber, col, transformedEndLocation.lineNumber, transformedEndLocation.columnNumber);
}

function hightlightStackFrame (stackFrame) {
  let transformedLocation = transformLocation(stackFrame.location);
  if (typeof editors[editors.length - 1].startOffset !== 'undefined') {
    transformedLocation.lineNumber -= editors[editors.length - 1].startOffset.row;
    transformedLocation.columnNumber -= editors[editors.length - 1].startOffset.column;
  }
  let range = new Range(transformedLocation.lineNumber, transformedLocation.columnNumber, transformedLocation.lineNumber, transformedLocation.columnNumber + 100*100);
  editors[editors.length - 1].scrollToLine(range.start.row, true, true);
  editors[editors.length - 1].stackFrameMarker = editors[editors.length - 1].getSession().addMarker(range, 'highlight', 'background');
  range = getScopeRange(stackFrame);
  if (typeof editors[editors.length - 1].startOffset !== 'undefined') {
    range.start.row -= editors[editors.length - 1].startOffset.row;
    range.start.col -= editors[editors.length - 1].startOffset.column;
  }
  editors[editors.length - 1].scopeMarker = editors[editors.length - 1].getSession().addMarker(range, 'highlightScope', 'background');
}

function setupAce (editorInstance) {
  editorInstance.getSession().setMode('ace/mode/javascript');
  editorInstance.setFontSize(16);
  editorInstance.setValue('');
  editorInstance.setOptions({
    maxLines: 25,
    minLines: 25
  });
}

setupIpcEvents();
setupDropbox();
setupAce(editor);
setupControls();
editor.setValue(`// Drag your .js file here!
function reverse (str) {
  if (str === '') {
    return '';
  }
  else {
    var val = reverse(str.substr(1)) + str[0];
    console.log(val);
    return val;
  }
}

console.log(reverse('hello'));
`);