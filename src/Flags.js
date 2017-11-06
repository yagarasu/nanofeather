import { EventEmitter } from 'events-es6'

class Flags extends EventEmitter {
  constructor () {
    super()
    this.flags = {
      carry: false,
      parity: false,
      zero: false,
      sign: false,
      overflow: false
    }
  }

  get carry () { return this.flags.carry }
  get parity () { return this.flags.parity }
  get zero () { return this.flags.zero }
  get sign () { return this.flags.sign }
  get overflow () { return this.flags.overflow }

  applyMath8 (A, B, res) {
    this.flags.zero = (res === 0)
    this.flags.sign = (res >> 7) > 0
    this.flags.parity = !!(res & 0x1)
    this.flags.overflow = ((A & 0x80) === (B & 0x80)) && (res & 0x80) !== (A & 0x80)
    if (res > 0xFF || res < 0) {
      this.flags.carry = true
      res = res && 0xFF
    } else {
      this.flags.carry = false
    }
    this.emit('setflags', Object.assign({}, this.flags))
    return res
  }

  applyMath16 (A, B, res) {
    this.flags.zero = (res === 0)
    this.flags.sign = (res >> 7) > 0
    this.flags.parity = !!(res & 0x1)
    this.flags.overflow = ((A & 0x8000) === (B & 0x8000)) && (res & 0x8000) !== (A & 0x8000)
    if (res > 0xFFFF || res < 0) {
      this.flags.carry = true
      res = res && 0xFFFF
    } else {
      this.flags.carry = false
    }
    this.emit('setflags', Object.assign({}, this.flags))
    return res
  }

  applyBit (A, B, res) {
    this.flags.zero = (res === 0)
    this.flags.sign = (res >> 7) > 0
    this.flags.parity = (res & 0x1)
    this.emit('setflags', Object.assign({}, this.flags))
    return res
  };
}

export default Flags
