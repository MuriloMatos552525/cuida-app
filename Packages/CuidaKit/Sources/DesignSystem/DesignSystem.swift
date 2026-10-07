import SwiftUI
import UIKit

/// Visual minimalista inspirado no Uber: preto e branco, uma cor de destaque,
/// tipografia do sistema e muito espaço em branco.
public enum Theme {
    /// Verde-azulado: cuidado e confiança. Única cor de destaque do app.
    public static let accent = Color(red: 0.05, green: 0.55, blue: 0.52)
    public static let ink = Color.primary
    public static let muted = Color.secondary
    public static let surface = Color(.secondarySystemBackground)
    public static let background = Color(.systemBackground)
    public static let danger = Color.red

    public static let corner: CGFloat = 16
    public static let padding: CGFloat = 20
}

public extension Font {
    static let display = Font.system(.largeTitle, design: .default).weight(.bold)
    static let heading = Font.system(.title2).weight(.bold)
    static let label = Font.system(.subheadline).weight(.semibold)
}

/// Botão principal, largo, preto (ou branco no modo escuro), como o "Confirmar" do Uber.
public struct PrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool

    public init(isLoading: Bool = false) { self.isLoading = isLoading }

    public func makeBody(configuration: Configuration) -> some View {
        HStack {
            if isLoading { ProgressView().tint(Theme.background) }
            configuration.label
        }
        .font(.headline)
        .frame(maxWidth: .infinity, minHeight: 56)
        .foregroundStyle(Theme.background)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: Theme.corner))
        .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(Theme.ink)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// Selo de verificação ("Identidade verificada", "Antecedentes OK").
public struct VerifiedBadge: View {
    let text: String
    let symbol: String

    public init(_ text: String, symbol: String = "checkmark.seal.fill") {
        self.text = text
        self.symbol = symbol
    }

    public var body: some View {
        Label(text, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Theme.accent.opacity(0.12), in: Capsule())
    }
}

public struct RatingView: View {
    let rating: Double
    let count: Int?

    public init(_ rating: Double, count: Int? = nil) {
        self.rating = rating
        self.count = count
    }

    public var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "star.fill").foregroundStyle(Theme.ink)
            Text(rating, format: .number.precision(.fractionLength(1)))
            if let count { Text("(\(count))").foregroundStyle(Theme.muted) }
        }
        .font(.subheadline.weight(.semibold))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Nota \(rating.formatted(.number.precision(.fractionLength(1)))) de 5")
    }
}

/// Foto do cuidador, com iniciais enquanto a imagem não carrega.
public struct Avatar: View {
    let name: String
    let url: URL?
    let size: CGFloat

    public init(name: String, url: URL?, size: CGFloat = 56) {
        self.name = name
        self.url = url
        self.size = size
    }

    public var body: some View {
        AsyncImage(url: url) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Text(initials)
                .font(.system(size: size * 0.36, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.surface)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    var initials: String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined()
    }
}

/// Cartão grande de categoria na tela inicial.
public struct CategoryCard: View {
    let title: String
    let subtitle: String
    let symbol: String

    public init(title: String, subtitle: String, symbol: String) {
        self.title = title
        self.subtitle = subtitle
        self.symbol = symbol
    }

    public var body: some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 56, height: 56)
                .background(Theme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(subtitle).font(.subheadline).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
        .accessibilityElement(children: .combine)
    }
}

/// Linha "rótulo .... valor" usada no detalhamento de preço.
public struct ValueRow: View {
    let label: String
    let value: String
    let emphasized: Bool

    public init(_ label: String, _ value: String, emphasized: Bool = false) {
        self.label = label
        self.value = value
        self.emphasized = emphasized
    }

    public var body: some View {
        HStack {
            Text(label).foregroundStyle(emphasized ? Theme.ink : Theme.muted)
            Spacer()
            Text(value).monospacedDigit()
        }
        .font(emphasized ? .headline : .body)
    }
}
