import Foundation

/// Contratos de acesso a dados. As telas só conhecem estes protocolos:
/// em produção usam `SupabaseData`, nos testes e no simulador sem backend usam `Mock*`.

public struct Session: Codable, Hashable, Sendable {
    public var userId: UUID
    public var name: String
    public var role: UserRole?

    public init(userId: UUID, name: String, role: UserRole?) {
        self.userId = userId
        self.name = name
        self.role = role
    }
}

public protocol AuthRepository: Sendable {
    func currentSession() async -> Session?
    func sendCode(toPhone phone: String) async throws
    func verify(phone: String, code: String) async throws -> Session
    func chooseRole(_ role: UserRole, name: String) async throws -> Session
    func signOut() async throws
}

public struct SearchQuery: Hashable, Sendable {
    public var category: ServiceCategory
    public var location: Coordinate
    public var start: Date
    public var end: Date
    public var specialtyIds: Set<String>

    public init(category: ServiceCategory, location: Coordinate, start: Date, end: Date, specialtyIds: Set<String> = []) {
        self.category = category
        self.location = location
        self.start = start
        self.end = end
        self.specialtyIds = specialtyIds
    }
}

public struct CaregiverResult: Codable, Hashable, Identifiable, Sendable {
    public var caregiver: Caregiver
    public var distanceKm: Double
    public var estimatedTotal: Cents

    public var id: UUID { caregiver.id }

    public init(caregiver: Caregiver, distanceKm: Double, estimatedTotal: Cents) {
        self.caregiver = caregiver
        self.distanceKm = distanceKm
        self.estimatedTotal = estimatedTotal
    }
}

public protocol CaregiverRepository: Sendable {
    /// Só devolve cuidadores com identidade e antecedentes válidos (o backend garante isso).
    func search(_ query: SearchQuery, request: QuoteRequest) async throws -> [CaregiverResult]
    func reviews(for caregiverId: UUID) async throws -> [Review]
    func specialties(for category: ServiceCategory) async throws -> [Specialty]
}

public protocol PricingRepository: Sendable {
    func rule(for category: ServiceCategory, city: String) async throws -> PricingRule
}

public struct NewBooking: Hashable, Sendable {
    public var caregiverId: UUID
    public var addressId: UUID
    public var request: QuoteRequest
    public var notes: String

    public init(caregiverId: UUID, addressId: UUID, request: QuoteRequest, notes: String) {
        self.caregiverId = caregiverId
        self.addressId = addressId
        self.request = request
        self.notes = notes
    }
}

public protocol BookingRepository: Sendable {
    /// O backend recalcula o preço e gera o PIN; o valor do app é só estimativa.
    func create(_ booking: NewBooking) async throws -> Booking
    func myBookings() async throws -> [Booking]
    func send(_ event: BookingEvent, bookingId: UUID) async throws -> Booking
    func review(bookingId: UUID, rating: Int, tags: [String], comment: String?) async throws
}

public protocol CaregiverWorkRepository: Sendable {
    func verifications() async throws -> [Verification]
    func setAvailable(_ available: Bool) async throws
    func incomingRequests() async throws -> [Booking]
}

public protocol SafetyRepository: Sendable {
    /// Registra a emergência no backend e avisa os contatos de confiança com a localização.
    func triggerEmergency(bookingId: UUID?, location: Coordinate?) async throws
}
