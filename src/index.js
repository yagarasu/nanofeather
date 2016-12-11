var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var Keyboard = require('./Devices/Keyboard');
cpu.installDevice(Keyboard);

var sysInts = require('./SysInts');
cpu.assignInterrupt(0x1, sysInts)

// cpu.memory.writeReg(0x0, 0x10);
// cpu.memory.writeReg(0x1, 0x10);

// function randomIntFromInterval(min,max) { return Math.floor(Math.random()*(max-min+1)+min); }

// for (var i = 0xF6E0; i < 0xFA00; i++) {
//   var st = randomIntFromInterval(0x1,0x3),
//       ch = randomIntFromInterval(0x1,0x39),
//       char = (st << 6) + ch;
//   cpu.memory.writeMem(i, char);
// }
//console.log('====== RENDER =====');
//cpu.screen.render();

var program = new Uint8Array([
  
  // Show keyboard chars
  
  // Screen mem in X
  42, 4, 0xE0,  // MOV XL, 0xE0
  42, 5, 0xF6,  // MOV XH, 0xF6
  
  42, 0, 0x2,   // MOV A, 0x2 ; Set 2 for int 0
  81, 0x0,      // INT 0x0 ; Call int 0 (kbd)
  
  76, 3, 0,     // CMP D, 0
  57, 31,       // JE 31
  40, 1, 20,    // MOV B, [X]
  26, 1, 0xC0,  // OR B, 0xC0
  43, 20, 1,    // MOV [X], B   ; Print char to screen
  17, 20,       // INC X
  18, 3,        // DEC D
  54, 0xB,      // JMP 0xB     ; Jump back to the loop
  
  0,            // HLT

]);

window.cpu = cpu;
cpu.loadProgram(program);
cpu.run();
