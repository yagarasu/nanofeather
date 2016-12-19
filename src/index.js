// polyfill lpad
String.prototype.lpad = function (length) {
  return ("0000" + this.toString()).slice(length * -1);
};

////////////////////////////////////////////////

var asmparser = require('./asmparser');

var CPU = require('./CPU');
var cpu = new CPU({
  output: document.getElementById('output')
});
window.cpu = cpu;

var Keyboard = require('./Devices/Keyboard');
// Install keyboard with buffer on 0xF5E1 and 256 bytes of buffer
cpu.installDevice(Keyboard, 0xF5E0, 256);

// Install sys interrupts
var sysInts = require('./SysInts');
cpu.assignInterrupt(0x1, sysInts)

// Bind labels to clock
cpu.clock.on('tick', function () {
  document.getElementById('meta-PC').innerHTML = cpu.PC.toString(16).lpad(4);
  document.getElementById('meta-SP').innerHTML = cpu.SP.toString(16).lpad(4);
  document.getElementById('meta-A').innerHTML = cpu.memory.readReg(0).toString(16).lpad(2);
  document.getElementById('meta-B').innerHTML = cpu.memory.readReg(1).toString(16).lpad(2);
  document.getElementById('meta-C').innerHTML = cpu.memory.readReg(2).toString(16).lpad(2);
  document.getElementById('meta-D').innerHTML = cpu.memory.readReg(3).toString(16).lpad(2);
  document.getElementById('meta-XL').innerHTML = cpu.memory.readReg(4).toString(16).lpad(2);
  document.getElementById('meta-XH').innerHTML = cpu.memory.readReg(5).toString(16).lpad(2);
  document.getElementById('meta-YL').innerHTML = cpu.memory.readReg(6).toString(16).lpad(2);
  document.getElementById('meta-YH').innerHTML = cpu.memory.readReg(7).toString(16).lpad(2);
  document.getElementById('meta-X').innerHTML = cpu.memory.readReg(20).toString(16).lpad(4);
  document.getElementById('meta-Y').innerHTML = cpu.memory.readReg(22).toString(16).lpad(4);
  
  document.getElementById('flag-C').innerHTML = (cpu.flags.carry) ? '1' : '0';
  document.getElementById('flag-P').innerHTML = (cpu.flags.parity) ? '1' : '0';
  document.getElementById('flag-Z').innerHTML = (cpu.flags.zero) ? '1' : '0';
  document.getElementById('flag-S').innerHTML = (cpu.flags.sign) ? '1' : '0';
  document.getElementById('flag-O').innerHTML = (cpu.flags.overflow) ? '1' : '0';
});

// Replace log
cpu.log = function () {
  if (this.debug) {
    var args = Array.prototype.slice.call(arguments);
    doLog(args.map(function (e) { return (typeof e === 'string') ? e : JSON.stringify(e) }).join("\t"));
  }
};

// Instantiate memviewer
var MemViewer = require('./MemViewer');
var mv = new MemViewer(document.getElementById('memMap'), cpu.memory._raw, 0);
mv.clock.on('tick', function () {
  document.getElementById('memMap-from').innerHTML = mv.offset.toString(16).lpad(4);
  document.getElementById('memMap-to').innerHTML = (mv.offset + mv.viewportLength).toString(16).lpad(4);
});
mv.start();
window.mv = mv;

// Bind some UI buttons
document.getElementById('ctrl-speed-up').addEventListener('click', function () {
  cpu.clock.speed += 10;
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-speed-down').addEventListener('click', function () {
  cpu.clock.speed -= 10;
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-speed-set').addEventListener('click', function () {
  cpu.clock.speed = parseInt(prompt('Set new clock speed:', '1000'), 10);
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-mv-up').addEventListener('click', function () {
  try {
    var off = mv.offset, newOffset = off + mv.viewportLength;
    mv.offset = newOffset;
    doLog('Set memviewer to', mv.offset.toString(16).lpad(4));
  } catch (e) {
    doLog('Memory limit reached in memviewer');
  }
});
document.getElementById('ctrl-mv-down').addEventListener('click', function () {
  try {
    var off = mv.offset, newOffset = off - mv.viewportLength;
    mv.offset = newOffset;
    doLog('Set memviewer to', mv.offset.toString(16).lpad(4));
  } catch (e) {
    doLog('Memory limit reached in memviewer');
  }
});
document.getElementById('ctrl-mv-set').addEventListener('click', function () {
  var newOffset = parseInt(prompt('Set new memview offset (hex): 0x', 'F5E0'), 16);
  if (isNaN(newOffset)) {
    doLog('Error! Offset', newOffset, 'is not a number');
    return;
  }
  mv.offset = newOffset;
  doLog('Set offset to', mv.offset);
});

// Bind hotkeys
window.addEventListener('keydown', function (e) {
  //console.log(e.which);
  // Ctrl C Compile
  if (e.ctrlKey && e.which === 67) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.halt();
    try {
      cpu.reset();
      var r = asmparser(document.getElementById('code-txt').value);
      cpu.loadProgram(Uint8Array.from(r.bytecode));
    } catch (e) {
      console.error(e);
      return;
    }
  }
  // Ctrl R to reset
  if (e.ctrlKey && e.which === 82) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.reset();
  }
  // Ctrl P to Pause/resume
  if (e.ctrlKey && e.which === 80) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (cpu.clock.timer !== null) {
      cpu.halt();
    } else {
      cpu.run();
    }
    e.preventDefault();
    return false;
  }
  // Ctrl D to debug
  if (e.ctrlKey && e.which === 68) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.toggleDebug();
    doLog('Set debug to:', cpu.debug);
    return false;
  }
});
