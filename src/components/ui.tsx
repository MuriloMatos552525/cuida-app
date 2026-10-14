import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PriceBreakdown } from '@shared/models';

import { brl, surchargeLabel } from '@/lib/format';
import { colors, font, radius, shadow, space } from '@/lib/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

// Componentes visuais do app. Poucos, grandes e com bastante respiro, no estilo do Uber.

export function Screen({
  children,
  scroll = true,
  footer,
  hero,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** Faixa colorida no topo; ocupa também a área da barra de status. */
  hero?: ReactNode;
  edges?: ('top' | 'bottom')[];
}) {
  const insets = useSafeAreaInsets();
  const top = hero ? (
    <View style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.heroInner}>{hero}</View>
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.screen} edges={hero ? edges.filter((e) => e !== 'top') : edges}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          {top}
          <View style={styles.content}>{children}</View>
        </ScrollView>
      ) : (
        <>
          {top}
          <View style={[styles.content, { flex: 1 }]}>{children}</View>
        </>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';

export function Text({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <RNText numberOfLines={numberOfLines} style={[textStyles[variant], color ? { color } : null, style]}>
      {children}
    </RNText>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.primarySoft, fg: colors.primary },
    danger: { bg: colors.danger, fg: '#FFFFFF' },
    ghost: { bg: 'transparent', fg: colors.primary },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: inactive ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={palette.fg} /> : null}
          <RNText style={[styles.buttonText, { color: palette.fg }]}>{title}</RNText>
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.onPrimary : colors.text} /> : null}
      <RNText style={[styles.chipText, selected && { color: colors.onPrimary }]}>{label}</RNText>
    </Pressable>
  );
}

/** Lista horizontal de opções; só uma selecionada. */
export function ChipPicker<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

export function Stepper({ value, onChange, min = 1, max = 10, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text>{label}</Text>
      <Row gap={space.md}>
        <RoundIcon icon="remove" onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} />
        <Text variant="heading" style={{ minWidth: 24, textAlign: 'center' }}>
          {value}
        </Text>
        <RoundIcon icon="add" onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} />
      </Row>
    </Row>
  );
}

export function RoundIcon({ icon, onPress, disabled }: { icon: IconName; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.roundIcon, disabled && { opacity: 0.3 }]} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput placeholderTextColor={colors.textSecondary} style={styles.input} {...props} />
    </View>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{title}</Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

/** Selo verde dos itens de segurança. */
export function TrustBadge({ label, icon = 'shield-checkmark' }: { label: string; icon?: IconName }) {
  return (
    <View style={styles.trustBadge}>
      <Ionicons name={icon} size={14} color={colors.trust} />
      <RNText style={styles.trustText}>{label}</RNText>
    </View>
  );
}

export function Notice({ text, tone = 'warning', icon }: { text: string; tone?: 'warning' | 'danger' | 'trust'; icon?: IconName }) {
  const palette = {
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    trust: [colors.trustSoft, colors.trust],
  }[tone];
  return (
    <Row style={[styles.notice, { backgroundColor: palette[0] }]}>
      <Ionicons name={icon ?? (tone === 'trust' ? 'shield-checkmark' : 'alert-circle')} size={20} color={palette[1]} />
      <Text style={{ flex: 1 }} color={palette[1]}>
        {text}
      </Text>
    </Row>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <Row gap={4}>
      <Ionicons name="star" size={14} color={colors.star} />
      <Text variant="label">{value ? value.toFixed(1).replace('.', ',') : 'Novo'}</Text>
      {count ? <Text variant="caption">({count})</Text> : null}
    </Row>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Row gap={space.sm} style={{ justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityLabel={`${n} estrelas`}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={36} color={n <= value ? colors.star : colors.border} />
        </Pressable>
      ))}
    </Row>
  );
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <RNText style={{ fontSize: size * 0.36, fontFamily: font.bold, color: colors.primary }}>{initials}</RNText>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
      <ActivityIndicator color={colors.text} />
    </View>
  );
}

/** Detalhamento do preço, com a taxa da plataforma separada. */
export function PriceDetails({ price, viewer }: { price: PriceBreakdown; viewer: 'cliente' | 'cuidador' }) {
  const unit = price.mode === 'hora' ? (price.billedUnits === 1 ? 'hora' : 'horas') : price.billedUnits === 1 ? 'diária' : 'diárias';
  const lines: [string, number][] = [[`${price.billedUnits} ${unit}`, price.timeAmount]];
  if (price.longStayDiscount) lines.push(['Desconto de pacote', -price.longStayDiscount]);
  if (price.surcharge && price.surchargeReason) lines.push([surchargeLabel[price.surchargeReason], price.surcharge]);
  if (price.dependentsExtra) lines.push(['Adicional por dependente', price.dependentsExtra]);
  if (price.specialtyExtra) lines.push(['Especialidade', price.specialtyExtra]);
  lines.push(['Deslocamento (ida e volta)', price.travelToLocation]);
  if (price.travelDuringService) lines.push(['Trajetos durante o serviço', price.travelDuringService]);

  return (
    <View style={{ gap: space.sm }}>
      {lines.map(([label, value]) => (
        <Row key={label} style={{ justifyContent: 'space-between' }}>
          <Text color={colors.textSecondary}>{label}</Text>
          <Text>{value < 0 ? `- ${brl(-value)}` : brl(value)}</Text>
        </Row>
      ))}
      <Divider />
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{viewer === 'cliente' ? 'Total' : 'Valor do serviço'}</Text>
        <Text variant="heading">{brl(price.total)}</Text>
      </Row>
      {viewer === 'cliente' ? (
        <Text variant="caption">Inclui a taxa da plataforma ({brl(price.platformFee)}), que cobre seguro, verificação e suporte.</Text>
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text color={colors.textSecondary}>Taxa da plataforma</Text>
            <Text>- {brl(price.platformFee)}</Text>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading" color={colors.trust}>
              Você recebe
            </Text>
            <Text variant="heading" color={colors.trust}>
              {brl(price.caregiverPayout)}
            </Text>
          </Row>
        </>
      )}
    </View>
  );
}

const textStyles = StyleSheet.create({
  display: { fontSize: 30, fontFamily: font.extrabold, color: colors.text, letterSpacing: -0.6, lineHeight: 36 },
  title: { fontSize: 22, fontFamily: font.bold, color: colors.text, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontFamily: font.bold, color: colors.text },
  body: { fontSize: 16, fontFamily: font.regular, color: colors.text, lineHeight: 22 },
  caption: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 18 },
  label: { fontSize: 14, fontFamily: font.semibold, color: colors.text },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, gap: space.lg, paddingBottom: space.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  footer: {
    padding: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: space.sm,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 17, fontFamily: font.bold },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, gap: space.sm, ...shadow },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: 15, fontFamily: font.medium, color: colors.text },
  roundIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: font.regular,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.trustSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  trustText: { fontSize: 12, fontFamily: font.semibold, color: colors.trust },
  notice: { padding: space.md, borderRadius: radius.sm, alignItems: 'flex-start' },
  hero: {
    backgroundColor: colors.hero,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  heroInner: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.sm },
  avatar: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
