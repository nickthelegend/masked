import { StyleSheet } from 'react-native';
import { color, type, space, radius, border, bevel } from '../tokens';

/** Type roles as ready-to-spread RN style objects. */
export const text = StyleSheet.create({
  wordmark:  { fontFamily: type.wordmark.family, fontSize: type.wordmark.size, lineHeight: type.wordmark.lineHeight, letterSpacing: 1, color: color.white },
  h1:        { fontFamily: type.h1.family, fontSize: type.h1.size, lineHeight: type.h1.lineHeight, color: color.white },
  h2:        { fontFamily: type.h2.family, fontSize: type.h2.size, lineHeight: type.h2.lineHeight, color: color.white },
  statBig:   { fontFamily: type.statBig.family, fontSize: type.statBig.size, lineHeight: type.statBig.lineHeight, color: color.yellow },
  label:     { fontFamily: type.label.family, fontSize: type.label.size, lineHeight: type.label.lineHeight, color: color.yellow },
  tabLabel:  { fontFamily: type.tabLabel.family, fontSize: type.tabLabel.size, lineHeight: type.tabLabel.lineHeight, color: color.white },
  numeric:   { fontFamily: type.numeric.family, fontSize: type.numeric.size, lineHeight: type.numeric.lineHeight, color: color.white },
  body:      { fontFamily: type.body.family, fontSize: type.body.size, lineHeight: type.body.lineHeight, color: color.text },
  bodySmall: { fontFamily: type.bodySmall.family, fontSize: type.bodySmall.size, lineHeight: type.bodySmall.lineHeight, color: color.textDim },
});

/** Hard 8-bit bevel: thick ink border + heavier bottom edge. No blur, no elevation. */
export const bevelBox = (bg = color.panel, depth = bevel.md, edge = color.ink) => ({
  backgroundColor: bg,
  borderWidth: border.base,
  borderColor: edge,
  borderBottomWidth: border.base + depth,
});

export const inset = { borderTopWidth: border.base, borderTopColor: 'rgba(255,255,255,0.22)' };

export { color, type, space, radius, border, bevel };
