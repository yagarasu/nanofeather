class Registers {
  constructor () {
    this.raw = new ArrayBuffer(8)
    this.regs8 = new Uint8Array(this.raw, 0)
    this.regs16 = new Uint8Array(this.raw, 4)
  }

  write (reg, value) {
    const regSet = (reg > 0xF) ? this.regs16 : this.regs8
    const regNum = this.opToRegNum(reg)
    if (regNum > regSet.length) throw new Error('Invalid register');
    return regSet[regNum] = value
  }

  read (reg) {
    const regSet = (reg > 0xF) ? this.regs16 : this.regs8
    const regNum = this.opToRegNum(reg)
    if (regNum > regSet.length) throw new Error('Invalid register');
    return regSet[regNum]
  }

  opToRegNum (op) {
    let regNum = op
    if (op > 0xF) {
      regNum = Math.floor(((op & 0xF) / 2) - 2)
    }
    return regNum
  }
}

export default Registers
