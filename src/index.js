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
  
  // Screen limit in Y
  // off: 6
  42, 6, 0xF7,  // MOV YL, 0xF7
  42, 7, 0x30,  // MOV YH, 0x30
  
  // Add prompt
  // off: 12
  45, 20, 0xC5, // MOV [X], 0xC5
  
  // Check keystrokes
  // off: 15
  42, 0, 0,     // MOV A, 0x0
  81, 0,        // INT 0x0; A=0
  76, 3, 0,     // CMP D, 0 ; No new keys
  57, 15,        // JE 15; Jump to loop
  
  // off: 25
  42, 0, 3,     // MOV A, 0x3 ; Copy keyboard buffer[B] to X, ORed with C
  42, 1, 0,     // MOV B, 0
  42, 2, 0xC0,  // MOV C, 0xC0; OR with white
  81, 0,        // INT 0x0; A=3
  
  // off: 36
  42, 0, 4,     // MOV A, 0x4; Force shift
  81, 0,        // INT 0x0; A=4
  42, 3, 0,     // MOV D, 0x0
  17, 20,       // INC X
  
  // off: 46
  73, 20, 22,   // CMP X, Y
  57, 53,       // JE 53
  54, 72,       // JMP 72
  
  // off: 53
  47, 2,          // PUSH C
  42, 2, 80,      // MOV C, 80; Counter to 80
  42, 0, 5,       // MOV A, 0x5; Force shift left
  81, 0,          // INT 0x0; A=5
  18, 2,          // DEC C
  73, 2, 0,       // CMP C, 0
  60, 59,         // JNE 59
  51, 2,          // POP C
  
  // off: 72
  45, 20, 0xC5, // MOV [X], 0xC5
  54, 15         // JMP 15; Return to main loop

]);

window.cpu = cpu;
cpu.loadProgram(program);

window.addEventListener('keydown', function (e) {
  //console.log(e);
  // Ctrl H to halt
  if (e.ctrlKey && e.which === 72) {
    cpu.halt();
    e.preventDefault();
    return false;
  }
  // Ctrl D to debug
  if (e.ctrlKey && e.which === 68) {
    cpu.toggleDebug();
    console.log('Set debug to:', cpu.debug);
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
