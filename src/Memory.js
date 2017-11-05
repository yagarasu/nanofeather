class Memory {
  constructor () {
    this.raw = new ArrayBuffer(255)
    this.mem = new Uint8Array(this.raw, 0)
  }

  clean () {
    this.mem.fill(0x0)
  }

  write (address, value) {
    if (address >= this.mem.length) throw new Error('Invalid memory location')
    return this.mem[address] = value
  }

  read (address) {
    if (address >= this.mem.length) throw new Error('Invalid memory location')
    return this.mem[address]
  }

  getRegion (address, length) {
    const len = (length !== undefined) ? length : this.mem.length - address
    if (len + address > this.mem.length) throw new Error('Given length is bigger than memory length')
  }
}

export default Memory
