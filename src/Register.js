class Registers {
  constructor () {
    this.raw = new ArrayBuffer(8)
    this.regs8 = new Uint8Array(this.raw, 0)
    this.regs16 = new Uint8Array(this.raw, 4)
  }

  write (reg, value) {
    
  }
}

export default Registers
