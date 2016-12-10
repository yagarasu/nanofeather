var CPU = require('./CPU');
var sysInts = require('./SysInts');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

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
  
  // Print "Hello, World!"
  54, 0xF, // JMP 0xF ; To the begining of execution
  
  // Data
  // H     E     L     L     O     ,    W     O     R     L     D     !    <null>
     0x28, 0x25, 0x2C, 0x2C, 0x2F, 0x7, 0x37, 0x2F, 0x32, 0x2C, 0x24, 0xC, 0x0,
     
  // Start program
  
  42, 4, 0x02,  // MOV XL, 0xE0 ; Set X to string
  42, 0, 0x0,   // MOV A, 0x02  ; Set INT 0x1 argument to 0x0 (console log);
  81, 0x1,      // INT 0x1      ; Call INT 01
  
  0,            // HLT

]);

window.cpu = cpu;
cpu.loadProgram(program);
cpu.run();
