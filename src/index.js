var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

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
  
  // Print chartmap in screen
  42, 4, 0xE0,  // MOV XL, 0xE0
  42, 5, 0xF6,  // MOV XH, 0xF6
  
  17, 0,        // INC A
  39, 1, 0,     // MOV B, A
  26, 1, 0xC0,  // OR B, 0xC0
  43, 20, 1,    // MOV [X], B
  17, 20,       // INC X
  
  76, 0, 63,    // CMP A, 63
  60, 6,        // JNE 0x6
  0             // HLT

]);

cpu.loadProgram(program);
cpu.run();
