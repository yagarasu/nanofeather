var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var Keyboard = require('./Devices/Keyboard');
// Install keyboard with buffer on 0xF5E1 and 256 bytes of buffer
cpu.installDevice(Keyboard, 0xF5E0, 256);

var sysInts = require('./SysInts');
cpu.assignInterrupt(0x1, sysInts)

var program = new Uint8Array([
  
  // Type in screen
  
  // Screen mem in X / Cursor pos
  42, 4, 0xE0,  // MOV XL, 0xE0
  42, 5, 0xF6,  // MOV XH, 0xF6
  
  // Add prompt
  45, 20, 0xC5, // MOV [X], 0xC5
  
  // Check keystrokes
  42, 0, 0,     // MOV A, 0x0
  81, 0,        // INT 0x0; A=0
  76, 3, 0,     // CMP D, 0 ; No new keys
  57, 9,        // JE 9; Jump to loop
  
  42, 0, 3,     // MOV A, 0x3 ; Copy keyboard buffer[B] to X, ORed with C
  42, 1, 0,     // MOV B, 0
  42, 2, 0xC0,  // MOV C, 0xC0; OR with white
  81, 0,        // INT 0x0; A=3
  
  42, 0, 4,     // MOV A, 0x4; Force shift
  81, 0,        // INT 0x0; A=4
  42, 3, 0,     // MOV D, 0x0
  17, 20,       // INC X
  45, 20, 0xC5, // MOV [X], 0xC5
  54, 9         // JMP 9; Return to main loop

]);

window.cpu = cpu;
cpu.loadProgram(program);

window.addEventListener('keydown', function (e) {
  //console.log(e);
  if (e.ctrlKey && e.which === 67) {
    cpu.halt();
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 107) {
    cpu.clock.speed += 10;
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 109) {
    cpu.clock.speed -= 10;
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 106) {
    cpu.clock.speed = parseInt(prompt('Set new clock speed:', '1000'), 10);
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
});

cpu.run();
