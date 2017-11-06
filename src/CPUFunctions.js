const getFlagMathFunc = (flags, value) => (value <= 0xF)
  ? flags.applyMath8.bind(flags)
  : flags.applyMath16.bind(flags)

export default {
  // HALT
  HLT: (cpu) => {
    cpu.halt()
  },
  // INCREMENT, DECREMENT
  INC: (cpu, arg1) => {
    const curVal = cpu.registers.read(arg1.value)
    let res = curVal + 1
    const flagFn = getFlagMathFunc(cpu.flags, arg1.value)
    res = flagFn(curVal, 1, res)
    cpu.registers.write(arg1.raw, res)
  },
  DEC: (cpu, arg1) => {
    const curVal = cpu.registers.read(arg1.value)
    let res = curVal - 1
    const flagFn = getFlagMathFunc(cpu.flags, arg1.value)
    res = flagFn(curVal, 1, res)
    cpu.registers.write(arg1.raw, res)
  },
  // MATH
  ADD: (cpu, arg1, arg2) => {
    let res = arg1.value + arg2.value
    res = cpu.flags.applyMath8(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  SUB: (cpu, arg1, arg2) => {
    let res = arg1.value - arg2.value
    res = cpu.flags.applyMath8(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  MUL: (cpu, arg1, arg2) => {
    let res = arg1.value * arg2.value
    res = cpu.flags.applyMath8(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  DIV: (cpu, arg1, arg2) => {
    let res = Math.round(arg1.value / arg2.value)
    res = cpu.flags.applyMath8(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  CMP: (cpu, arg1, arg2) => {
    let res = arg1.value - arg2.value
    res = cpu.flags.applyMath8(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  // BITWISE
  AND: (cpu, arg1, arg2) => {
    let res = arg1.value & arg2.value
    res = cpu.flags.applyBit(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  OR: (cpu, arg1, arg2) => {
    let res = arg1.value | arg2.value
    res = cpu.flags.applyBit(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  XOR: (cpu, arg1, arg2) => {
    let res = arg1.value ^ arg2.value
    res = cpu.flags.applyBit(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  SHL: (cpu, arg1, arg2) => {
    let res = (arg1.value << arg2.value) & 0xFF
    res = cpu.flags.applyBit(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  SHR: (cpu, arg1, arg2) => {
    let res = (arg1.value >> arg2.value) & 0xFF
    res = cpu.flags.applyBit(arg1.value, arg2.value, res)
    cpu.registers.write(arg1.raw, res)
  },
  // STACK
  PUSH: (cpu, arg1) => {
    cpu.memory.write(cpu.SP--, arg1.value)
  },
  POP: (cpu, arg1) => {
    const value = cpu.memory.read(cpu.SP++)
    cpu.reagisters.write(arg1.raw, value)
  },
  // JUMPS
  JMP: (cpu, arg1) => {
    cpu.PC = arg1.value
  },
  JE: (cpu, arg1) => {
    if (cpu.flags.zero) {
      cpu.PC = arg1.value
    }
  },
  JNE: (cpu, arg1) => {
    if (!cpu.flags.zero) {
      cpu.PC = arg1.value
    }
  },
  JG: (cpu, arg1) => {
    if (cpu.flags.sign !== cpu.flags.overflow) {
      cpu.PC = arg1.value
    }
  },
  JGE: (cpu, arg1) => {
    if (cpu.flags.carry || cpu.flags.zero) {
      cpu.PC = arg1.value
    }
  },
  JL: (cpu, arg1) => {
    if (!cpu.flags.zero && (cpu.flags.sign === cpu.flags.overflow)) {
      cpu.PC = arg1.value
    }
  },
  JLE: (cpu, arg1) => {
    if (cpu.flags.sign === cpu.flags.overflow) {
      cpu.PC = arg1.value
    }
  },
  // MOV
  MOV: (cpu, arg1, arg2) => {
    if (arg1.type === 'R') {
      cpu.registers.write(arg1.raw, arg2.value)
    }
    if (arg1.type === 'RA' || arg1.type === 'A' || arg1.type === 'C') {
      cpu.memory.write(arg1.value, arg2.value)
    }
  },
  // BREAK
  BRK: (cpu) => {
    cpu.halt()
    cpu.emit('break', cpu)
  }
}
