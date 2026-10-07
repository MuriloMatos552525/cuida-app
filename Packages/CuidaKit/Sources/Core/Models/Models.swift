import Foundation

/// Valores em dinheiro sempre em centavos, para não perder precisão com Double.
public typealias Cents = Int

public enum ServiceCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case nanny = "baba"
    case petSitter = "pet"
    case elderCare = "idoso"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .nanny: "Babá"
        case .petSitter: "Pet sitter"
        case .elderCare: "Cuidador de idosos"
        }
    }

    public var subtitle: String {
        switch self {
        case .nanny: "Cuidado com crianças"
        case .petSitter: "Cuidado e passeio de pets"
        case .elderCare: "Companhia e cuidados para idosos"
        }
    }

    /// Nome do SF Symbol usado no cartão da categoria.
    public var symbol: String {
        switch self {
        case .nanny: "figure.and.child.holdinghands"
        case .petSitter: "pawprint.fill"
        case .elderCare: "figure.2.arms.open"
        }
    }

    /// Como o app chama quem recebe o cuidado nesta categoria.
    public var dependentNoun: (singular: String, plural: String) {
        switch self {
        case .nanny: ("criança", "crianças")
        case .petSitter: ("pet", "pets")
        case .elderCare: ("pessoa", "pessoas")
        }
    }
}

public enum UserRole: String, Codable, Sendable {
    case client = "cliente"
    case caregiver = "cuidador"
}

public struct Coordinate: Codable, Hashable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Distância em linha reta (fórmula de haversine), em km.
    /// Usada só para estimativa; o backend usa a rota real quando disponível.
    public func distanceKm(to other: Coordinate) -> Double {
        let earthRadiusKm = 6371.0
        let dLat = (other.latitude - latitude) * .pi / 180
        let dLon = (other.longitude - longitude) * .pi / 180
        let lat1 = latitude * .pi / 180
        let lat2 = other.latitude * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) + sin(dLon / 2) * sin(dLon / 2) * cos(lat1) * cos(lat2)
        return earthRadiusKm * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}

public struct Address: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var label: String
    public var street: String
    public var city: String
    public var coordinate: Coordinate

    public init(id: UUID = UUID(), label: String, street: String, city: String, coordinate: Coordinate) {
        self.id = id
        self.label = label
        self.street = street
        self.city = city
        self.coordinate = coordinate
    }
}

public enum VerificationKind: String, Codable, CaseIterable, Sendable {
    case cpf
    case document = "documento"
    case selfie
    case criminalRecord = "antecedentes"

    public var title: String {
        switch self {
        case .cpf: "CPF na Receita"
        case .document: "Documento com foto"
        case .selfie: "Selfie com prova de vida"
        case .criminalRecord: "Antecedentes criminais"
        }
    }
}

public enum VerificationStatus: String, Codable, Sendable {
    case pending = "pendente"
    case inReview = "em_analise"
    case approved = "aprovado"
    case rejected = "reprovado"
    case expired = "expirado"
}

public struct Verification: Codable, Hashable, Sendable {
    public var kind: VerificationKind
    public var status: VerificationStatus
    public var validUntil: Date?

    public init(kind: VerificationKind, status: VerificationStatus, validUntil: Date? = nil) {
        self.kind = kind
        self.status = status
        self.validUntil = validUntil
    }
}

public struct Specialty: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var category: ServiceCategory

    public init(id: String, name: String, category: ServiceCategory) {
        self.id = id
        self.name = name
        self.category = category
    }
}

public struct Caregiver: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var photoURL: URL?
    public var bio: String
    public var categories: [ServiceCategory]
    public var specialties: [Specialty]
    public var rating: Double
    public var reviewCount: Int
    public var coordinate: Coordinate
    public var serviceRadiusKm: Double
    public var isIdentityVerified: Bool
    /// Data da última certidão de antecedentes aprovada; o selo some quando vence.
    public var backgroundCheckedAt: Date?

    public init(
        id: UUID = UUID(), name: String, photoURL: URL? = nil, bio: String,
        categories: [ServiceCategory], specialties: [Specialty], rating: Double, reviewCount: Int,
        coordinate: Coordinate, serviceRadiusKm: Double, isIdentityVerified: Bool, backgroundCheckedAt: Date?
    ) {
        self.id = id
        self.name = name
        self.photoURL = photoURL
        self.bio = bio
        self.categories = categories
        self.specialties = specialties
        self.rating = rating
        self.reviewCount = reviewCount
        self.coordinate = coordinate
        self.serviceRadiusKm = serviceRadiusKm
        self.isIdentityVerified = isIdentityVerified
        self.backgroundCheckedAt = backgroundCheckedAt
    }

    public var firstName: String { name.split(separator: " ").first.map(String.init) ?? name }
}

public struct Review: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var authorName: String
    public var rating: Int
    public var tags: [String]
    public var comment: String?
    public var createdAt: Date

    public init(id: UUID = UUID(), authorName: String, rating: Int, tags: [String], comment: String?, createdAt: Date) {
        self.id = id
        self.authorName = authorName
        self.rating = rating
        self.tags = tags
        self.comment = comment
        self.createdAt = createdAt
    }
}
