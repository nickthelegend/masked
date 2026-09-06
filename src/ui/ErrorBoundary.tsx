import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import PixelPanel from './PixelPanel';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import Stack from './Stack';
import Wordmark from './Wordmark';
import { color, space } from './theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render crash mid-demo is the worst possible failure — a blank white screen
 * in front of a judge. This catches it and shows something that still looks
 * like the product, with the actual error, and a way to carry on.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[fogduel] render error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ padding: space.xl, gap: space.lg, maxWidth: 640, alignSelf: 'center', width: '100%' }}
      >
        <Wordmark size={16} />
        <PixelText variant="h2" color={color.red}>
          SOMETHING BROKE
        </PixelText>
        <PixelPanel flat bg={color.chartBg}>
          <Stack gap={space.sm}>
            <PixelText variant="label" size={8}>
              {error.name.toUpperCase()}
            </PixelText>
            <PixelText variant="bodySmall" size={10} color={color.textDim}>
              {error.message}
            </PixelText>
          </Stack>
        </PixelPanel>
        <PixelButton tone="gold" label="TRY AGAIN" onPress={this.reset} />
      </ScrollView>
    );
  }
}
