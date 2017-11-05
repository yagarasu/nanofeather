const CPU {
  constructor ({ registers, memory }) {
    this.registers = registers
    this.memory = memory
    this.PC = 0
    this.SP = this.memory.length - 1
  }

  loadProgram (prog, offset = 0) {
    this.memory.set(prog, offset)
  }

  step () {
    const bc = this.getNextByte()
  }

  getNextByte () {
    return this.memory.read(this.PC++)
  }

}

export default CPU
