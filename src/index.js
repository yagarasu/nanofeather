require('babel-polyfill')

import CPU from './CPU'
import Memory from './Memory'
import Registers from './Registers'
import Flags from './Flags'
import Clock from './Clock'

const cpu = new CPU({
  memory: new Memory(),
  registers: new Registers(),
  flags: new Flags(),
  clock: new Clock(500)
})

const prog = new Uint8Array([
  42, 0, 10, // MOV A, 10
  42, 1, 10, // MOV A, 20,
  0x0
])

cpu.loadProgram(prog)

cpu.run()


cpu.on('exec', (cmd, arg1, arg2) => {
  console.log('Exec:', cmd, arg1, arg2)
})
cpu.on('halt', () => {
  console.log('HALT')
})

window.cpu = cpu
