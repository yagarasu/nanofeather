var Memory = function () {
  this._raw = new ArrayBuffer(4000);
  this.mem = new Uint8Array(this._raw, 0);
  this.registers = new Uint8Array(4);
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  this.registers[reg] = value;
};

Memory.prototype.readReg = function (reg) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg];
};

module.exports = Memory;
