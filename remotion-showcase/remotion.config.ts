import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
Config.setOverwriteOutput(true)
// The Live Orb is a WebGL shader. ANGLE gives consistent WebGL output in headless renders.
Config.setChromiumOpenGlRenderer('angle')
// One concurrent tab per CPU core is plenty; WebGL contexts are memory-hungry.
Config.setConcurrency(null)
