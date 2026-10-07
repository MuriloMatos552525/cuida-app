import Foundation

/// Implementações em memória usadas no simulador sem backend e nos testes.
/// Simulam o comportamento do backend, inclusive o recálculo do preço e o PIN.
public actor MockStore {
    public var session: Session?
    public var bookings: [Booking] = []
    public var isAvailable = true

    public init(session: Session? = nil) {
        self.session = session
    }

    func setSession(_ session: Session?) { self.session = session }
    func upsert(_ booking: Booking) {
        if let index = bookings.firstIndex(where: { $0.id == booking.id }) {
            bookings[index] = booking
        } else {
            bookings.insert(booking, at: 0)
        }
    }
    func setAvailable(_ value: Bool) { isAvailable = value }
}

public struct MockAuthRepository: AuthRepository {
    let store: MockStore
    public init(store: MockStore) { self.store = store }

    public func currentSession() async -> Session? { await store.session }

    public func sendCode(toPhone phone: String) async throws {
        try await Task.sleep(for: .milliseconds(400))
    }

    /// No modo de exemplo qualquer código de 6 dígitos funciona.
    public func verify(phone: String, code: String) async throws -> Session {
        try await Task.sleep(for: .milliseconds(400))
        let session = Session(userId: UUID(), name: "", role: nil)
        await store.setSession(session)
        return session
    }

    public func chooseRole(_ role: UserRole, name: String) async throws -> Session {
        var session = await store.session ?? Session(userId: UUID(), name: name, role: role)
        session.role = role
        session.name = name
        await store.setSession(session)
        return session
    }

    public func signOut() async throws { await store.setSession(nil) }
}

public struct MockPricingRepository: PricingRepository {
    public init() {}
    public func rule(for category: ServiceCategory, city: String) async throws -> PricingRule {
        MockData.rule(for: category)
    }
}

public struct MockCaregiverRepository: CaregiverRepository {
    let engine = PricingEngine()
    public init() {}

    public func search(_ query: SearchQuery, request: QuoteRequest) async throws -> [CaregiverResult] {
        try await Task.sleep(for: .milliseconds(300))
        let rule = MockData.rule(for: query.category)
        return try MockData.caregivers
            .filter { $0.categories.contains(query.category) }
            .filter { query.specialtyIds.isSubset(of: Set($0.specialties.map(\.id))) }
            .compactMap { caregiver -> CaregiverResult? in
                let distance = caregiver.coordinate.distanceKm(to: query.location)
                guard distance <= caregiver.serviceRadiusKm else { return nil }
                var request = request
                request.distanceToLocationKm = distance
                let price = try engine.quote(request, rule: rule)
                return CaregiverResult(caregiver: caregiver, distanceKm: distance, estimatedTotal: price.total)
            }
            .sorted { ($0.caregiver.rating, -$0.distanceKm) > ($1.caregiver.rating, -$1.distanceKm) }
    }

    public func reviews(for caregiverId: UUID) async throws -> [Review] { MockData.reviews }

    public func specialties(for category: ServiceCategory) async throws -> [Specialty] {
        MockData.specialties.filter { $0.category == category }
    }
}

public struct MockBookingRepository: BookingRepository {
    let store: MockStore
    let engine = PricingEngine()
    public init(store: MockStore) { self.store = store }

    public func create(_ new: NewBooking) async throws -> Booking {
        guard let caregiver = MockData.caregivers.first(where: { $0.id == new.caregiverId }) else {
            throw URLError(.badServerResponse)
        }
        var request = new.request
        request.distanceToLocationKm = caregiver.coordinate.distanceKm(to: MockData.home.coordinate)
        let price = try engine.quote(request, rule: MockData.rule(for: request.category))
        let booking = Booking(
            category: request.category, caregiver: caregiver, clientName: await store.session?.name ?? "Você",
            address: MockData.home, start: request.start, end: request.end, status: .requested,
            startPin: String(format: "%04d", Int.random(in: 0...9999)), notes: new.notes, price: price
        )
        await store.upsert(booking)
        return booking
    }

    public func myBookings() async throws -> [Booking] { await store.bookings }

    public func send(_ event: BookingEvent, bookingId: UUID) async throws -> Booking {
        guard var booking = await store.bookings.first(where: { $0.id == bookingId }) else {
            throw URLError(.fileDoesNotExist)
        }
        booking.status = try BookingStateMachine.next(from: booking.status, on: event, expectedPin: booking.startPin)
        await store.upsert(booking)
        return booking
    }

    public func review(bookingId: UUID, rating: Int, tags: [String], comment: String?) async throws {
        _ = try await send(.review, bookingId: bookingId)
    }
}

public struct MockCaregiverWorkRepository: CaregiverWorkRepository {
    let store: MockStore
    public init(store: MockStore) { self.store = store }

    public func verifications() async throws -> [Verification] {
        [
            Verification(kind: .cpf, status: .approved),
            Verification(kind: .document, status: .approved),
            Verification(kind: .selfie, status: .inReview),
            Verification(kind: .criminalRecord, status: .pending),
        ]
    }

    public func setAvailable(_ available: Bool) async throws { await store.setAvailable(available) }

    public func incomingRequests() async throws -> [Booking] {
        await store.bookings.filter { $0.status == .requested }
    }
}

public struct MockSafetyRepository: SafetyRepository {
    public init() {}
    public func triggerEmergency(bookingId: UUID?, location: Coordinate?) async throws {}
}
