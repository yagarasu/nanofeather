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
  
  // Print "Hello, World!"
  54, 0xF, // JMP 0xF ; To the begining of execution
  
  // Data
  // H     E     L     L     O     ,    W     O     R     L     D     !    <null>
     0x28, 0x25, 0x2C, 0x2C, 0x2F, 0x7, 0x37, 0x2F, 0x32, 0x2C, 0x24, 0xC, 0x0,
     
  // Start program
  
  42, 4, 0xE0,  // MOV XL, 0xE0 ; Set X to Screen mem
  42, 5, 0xF6,  // MOV XH, 0xF6
  
  42, 0, 0x02,  // MOV A, 0x02  ; point string to A
  
  40, 1, 0,     // MOV B, [A]   ; Add color flags
  76, 1, 0,     // CMP B, 0     ; Compare char with null
  57, 0x2C,     // JE 0x2C      ; Jump out of loop if null found
  26, 1, 0xC0,  // OR B, 0xC0   ;  to char into B from A pointer
  43, 20, 1,    // MOV [X], B   ; Print char to screen
  17, 20,       // INC X        ; Increment screen pointer
  17, 0,        // INC A        ; Increment string pointer
  54, 0x18,     // JMP 0x18     ; Jump back to the loop
  
  0,            // HLT

]);

cpu.loadProgram(program);
cpu.run();
