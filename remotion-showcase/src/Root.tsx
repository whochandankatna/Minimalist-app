import { Composition, Folder } from 'remotion'
import { DURATION_IN_FRAMES, FPS } from './config/timeline'
import { Showcase, showcaseSchemaDefaults } from './Showcase'
import './styles'

export const RemotionRoot: React.FC = () => (
  <Folder name="Tropicool-Treats">
    {/* Primary 16:9 composition */}
    <Composition
      id="TropicoolShowcaseDesktop"
      component={Showcase}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={showcaseSchemaDefaults}
    />
    {/* 9:16 social composition */}
    <Composition
      id="TropicoolShowcaseVertical"
      component={Showcase}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={showcaseSchemaDefaults}
    />
  </Folder>
)
