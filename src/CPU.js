import { EventEmitter } from 'events-es6'
import opcodes from './opcodes'
import CPUFunctions from './CPUFunctions'

const { oplist } = opcodes

class CPU extends EventEmitter {
  constructor ({ registers, memory, clock, flags }) {
    super()
    this.flags = flags
    this.registers = registers
    this.memory = memory
    this.clock = clock
    this.clock.on('tick', this.step.bind(this))
    this.halted = true
    this.clock.on('start', () => this.halted = false)
    this.clock.on('stop', () => this.halted = true)
    this.PC = 0
    this.SP = this.memory.length - 1
  }

  loadProgram (prog, offset = 0) {
    this.memory.set(prog, offset)
  }

  reset () {
    this.clock.stop()
    this.PC = 0
    this.SP = this.memory.length - 1
    this.memory.clean()
  }

  halt () {
    this.clock.stop()
    this.emit('halt')
  }

  run () {
    this.clock.start()
    this.emit('start')
  }

  step () {
    try {
      const { cmd, arg1, arg2 } = this.getNextCommand()
      if (typeof CPUFunctions[cmd] !== "function") throw new Error(`Unknown arg type "${cmd}"`)
      CPUFunctions[cmd](this, arg1, arg2)
      this.emit('exec', cmd, arg1, arg2)
    } catch (e) {
      // ERR
      throw e // Bubble up
    }
  }

  getNextByte () {
    this.emit('pcinc')
    return this.memory.read(this.PC++)
  }

  getNextCommand () {
    const bytecode = this.getNextByte()
    const op = oplist[bytecode]
    if (op === undefined) throw new Error(`Ilegal opcode found: ${bytecode}`)
    const parts = op.match(/^([A-Z]+)(_([A-Z]+))?(_([A-Z]+))?$/)
    const cmd = { cmd: parts[1] }
    if (parts[3] !== undefined) {
      cmd.arg1 = Object.assign({ type: parts[3] }, this.getNextArg(parts[3]))
    }
    if (parts[5] !== undefined) {
      cmd.arg2 = Object.assign({ type: parts[5] }, this.getNextArg(parts[5]))
    }
    return cmd
  }

  getNextArg (type) {
    const typeFns = {
      C: () => this.getNextByte(),
      R: () => {
        const raw = this.getNextByte()
        const value = this.registers.read(raw)
        return { value, raw }
      },
      RA: () => {
        const raw = this.getNextByte()
        const value = this.memory.read(this.registers.read(raw))
        return { value, raw }
      },
      CA: () => {
        const addr1 = this.getNextByte()
        const addr2 = this.getNextByte()
        const raw = (addr1 << 8) + addr2
        return { value: raw, raw }
      },
      A: () => {
        const addr1 = this.getNextByte()
        const addr2 = this.getNextByte()
        const raw = (addr1 << 8) + addr2
        const value = this.memory.read(raw)
        return { value: raw, raw }
      }
    }
    if (typeof typeFns[type] !== "function") throw new Error(`Unknown arg type "${type}"`)
    return typeFns[type]()
  }

}

export default CPU
