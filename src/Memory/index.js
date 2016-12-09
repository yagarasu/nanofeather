var Memory = function () {
  this._raw = new ArrayBuffer(64000);
  this.mem = new Uint8Array(this._raw, 0);
  this._registers = new ArrayBuffer(8);
  this.regs8 = new Uint8Array(this._registers, 0);
  this.regs16 = new Uint16Array(this._registers, 4);
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg > 0xF) {
    var regNum = Math.floor(((reg & 0xF) / 2) - 2);
    return this.writeReg16(regNum, value);
  }
  return this.writeReg8(reg, value);
};

Memory.prototype.readReg = function (reg) {
  if (reg > 0xF) {
    var regNum = Math.floor(((reg & 0xF) / 2) - 2);
    return this.readReg16(regNum);
  }
  return this.readReg8(reg);
};

Memory.prototype.writeReg8 = function (reg, value) {
  if (reg > this.regs8.length) throw new Error('Invalid register');
  return this.regs8[reg] = value;
};

Memory.prototype.readReg8 = function (reg) {
  if (reg >= this.regs8.length) throw new Error('Invalid register');
  return this.regs8[reg];
};

Memory.prototype.writeReg16 = function (reg, value) {
  if (reg > this.regs16.length) throw new Error('Invalid register');
  return this.regs16[reg] = value;
};

Memory.prototype.readReg16 = function (reg) {
  if (reg >= this.regs16.length) throw new Error('Invalid register');
  return this.regs16[reg]
};

Memory.prototype.writeMem = function (address, value) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  return this.mem[address] = value;
};

Memory.prototype.readMem = function (address) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  return this.mem[address];
};

Memory.prototype.getMap = function (address, length) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  if (address + length > this.mem.length) throw new Error('Memory length overflow');
  return new Uint8Array(this._raw, address, length);
}

module.exports = Memory;
