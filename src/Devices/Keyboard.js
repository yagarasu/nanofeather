var Keyboard = function (cpu) {
  var interrupt = false;
  var key = null;
  var event = null;
  
  var kc2charmap = function (k) {
    if (k >= 48 && k <= 57) { // Number
      return k - 32;
    }
    if (k >= 65 && k <= 90) { // Char: Wow, same interval!
      return k - 32;
    }
    var map = {
      107: 0x01,
      109: 0x02,
      106: 0x03,
      111: 0x04,
      188: 0x06,
      107: 0x07,
      160: 0x0A
    };
    return map[k];
  };
  
  var evtHnd = function (e) {
    console.log('key', e);
    //key = kc2charmap(keycode);
    var keycode = e.which;
    interrupt = true;
    key = e.which;
    event = e.type;
  };
  
  document.addEventListener('keypress', evtHnd);
  // document.addEventListener('keyup', evtHnd);
  
  cpu.assignInterrupt(0, function (memory, PC, SP) {
    console.log('interrupt in keyboard', key);
    var cmd = memory.readReg(0x0); // Read A
    console.log('cmd', cmd);
    switch (cmd) {
      // Write current keypress on reg D
      case 0x0:
        if (!interrupt) return cpu.iret();
        interrupt = false;
        memory.writeReg(0x3, key);
        return cpu.iret();
      // Write keystroke into X
      case 0x1:
        var buffer = memory.readReg(20);
        if (!interrupt) return cpu.iret();
        interrupt = false;
        memory.writeMem(buffer, key);
        return cpu.iret();
      // Write a stream of keystrokes starting into X
      case 0x2:
        var buffer = memory.readReg(20);
        var stream = [];
        var keyStream = function (e) {
          // Wait until enter
          if (e.which === 13) {
            document.removeEventListener('keypress', keyStream);
            for (var i = 0; i < stream.length; i++) {
              memory.writeMem(buffer + i, stream[i]);
            }
            // Write length into reg D
            memory.writeReg(0x3, stream.length);
            interrupt = false;
            return cpu.iret();
          }
          stream.push(e.which);
        };
        document.addEventListener('keypress', keyStream);
        break;
    }
  });
  
};

module.exports = Keyboard;