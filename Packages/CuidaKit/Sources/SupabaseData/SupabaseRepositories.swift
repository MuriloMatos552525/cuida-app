import Core
import Foundation
import Supabase

/// Repositórios reais, falando com o Supabase. As regras de segurança e o preço final
/// são decididos no banco (funções em supabase/migrations); aqui só chamamos e decodificamos.
public enum SupabaseBackend {
    public static func makeRepositories(url: URL, anonKey: String) -> (
        auth: any AuthRepository, caregivers: any CaregiverRepository, pricing: any PricingRepository,
        bookings: any BookingRepository, work: any CaregiverWorkRepository, safety: any SafetyRepository
    ) {
        let client = SupabaseClient(supabaseURL: url, supabaseKey: anonKey)
        return (
            SupabaseAuthRepository(client: client), SupabaseCaregiverRepository(client: client),
            SupabasePricingRepository(client: client), SupabaseBookingRepository(client: client),
            SupabaseCaregiverWorkRepository(client: client), SupabaseSafetyRepository(client: client)
        )
    }
}

/// Decodificador para o JSON das funções do banco (datas ISO 8601, com ou sem frações de segundo).
func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
        var text = try decoder.singleValueContainer().decode(String.self)
        // O Postgres manda microssegundos (6 dígitos); o formatador aceita milissegundos.
        if let dot = text.firstIndex(of: "."),
           let zone = text[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            let digits = text[text.index(after: dot)..<zone].prefix(3)
            text = String(text[..<dot]) + "." + digits + String(text[zone...])
        }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: text) ?? ISO8601DateFormatter().date(from: text) {
            return date
        }
        throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Data inválida: \(text)"))
    }
    return decoder
}

extension SupabaseClient {
    /// Chama uma função do banco e decodifica a resposta com `makeDecoder()`.
    func call<T: Decodable>(_ function: String, _ params: some Encodable & Sendable = [String: String]()) async throws -> T {
        let data = try await rpc(function, params: params).execute().data
        return try makeDecoder().decode(T.self, from: data)
    }
}

struct ProfileRow: Decodable {
    let role: UserRole
    let full_name: String
}

struct SupabaseAuthRepository: AuthRepository {
    let client: SupabaseClient

    func currentSession() async -> Session? {
        guard let user = client.auth.currentUser else { return nil }
        let profile: ProfileRow? = try? await client.from("profiles")
            .select("role, full_name").eq("id", value: user.id).single().execute().value
        return Session(userId: user.id, name: profile?.full_name ?? "", role: profile?.role)
    }

    func sendCode(toPhone phone: String) async throws {
        try await client.auth.signInWithOTP(phone: phone)
    }

    func verify(phone: String, code: String) async throws -> Session {
        try await client.auth.verifyOTP(phone: phone, token: code, type: .sms)
        guard let session = await currentSession() else { throw URLError(.userAuthenticationRequired) }
        return session
    }

    func chooseRole(_ role: UserRole, name: String) async throws -> Session {
        guard let user = client.auth.currentUser else { throw URLError(.userAuthenticationRequired) }
        struct NewProfile: Encodable {
            let id: UUID
            let role: UserRole
            let full_name: String
        }
        try await client.from("profiles").upsert(NewProfile(id: user.id, role: role, full_name: name)).execute()
        return Session(userId: user.id, name: name, role: role)
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }
}

struct SupabaseCaregiverRepository: CaregiverRepository {
    let client: SupabaseClient

    func search(_ query: SearchQuery, request: QuoteRequest) async throws -> [CaregiverResult] {
        struct Params: Encodable, Sendable {
            let p_category: ServiceCategory
            let p_lat: Double
            let p_lng: Double
            let p_start: Date
            let p_end: Date
            let p_mode: BillingMode
            let p_dependents: Int
            let p_trips_km: Double
            let p_specialty_ids: [String]
        }
        return try await client.call("search_caregivers", Params(
            p_category: query.category, p_lat: query.location.latitude, p_lng: query.location.longitude,
            p_start: query.start, p_end: query.end, p_mode: request.mode, p_dependents: request.dependents,
            p_trips_km: request.tripsDuringServiceKm, p_specialty_ids: Array(query.specialtyIds)))
    }

    func reviews(for caregiverId: UUID) async throws -> [Review] {
        try await client.call("caregiver_reviews", ["p_caregiver": caregiverId])
    }

    func specialties(for category: ServiceCategory) async throws -> [Specialty] {
        try await client.from("specialties").select().eq("category", value: category.rawValue).execute().value
    }
}

struct SupabasePricingRepository: PricingRepository {
    let client: SupabaseClient

    func rule(for category: ServiceCategory, city: String) async throws -> PricingRule {
        struct Row: Decodable {
            let hourly_rate, daily_rate, minimum_hours, long_stay_days, long_stay_discount_bp: Int
            let travel_base_fee, per_km_rate, night_surcharge_bp, weekend_surcharge_bp, holiday_surcharge_bp: Int
            let extra_dependent_bp, specialty_surcharge_bp, platform_fee_bp: Int
        }
        let row: Row = try await client.from("pricing_rules").select()
            .eq("category", value: category.rawValue).eq("city", value: city).single().execute().value
        return PricingRule(
            category: category, city: city, hourlyRate: row.hourly_rate, dailyRate: row.daily_rate,
            minimumHours: row.minimum_hours, longStayDays: row.long_stay_days,
            longStayDiscountBp: row.long_stay_discount_bp, travelBaseFee: row.travel_base_fee,
            perKmRate: row.per_km_rate, nightSurchargeBp: row.night_surcharge_bp,
            weekendSurchargeBp: row.weekend_surcharge_bp, holidaySurchargeBp: row.holiday_surcharge_bp,
            extraDependentBp: row.extra_dependent_bp, specialtySurchargeBp: row.specialty_surcharge_bp,
            platformFeeBp: row.platform_fee_bp)
    }
}

struct SupabaseBookingRepository: BookingRepository {
    let client: SupabaseClient

    func create(_ new: NewBooking) async throws -> Booking {
        struct Params: Encodable, Sendable {
            let p_caregiver_id: UUID
            let p_address_id: UUID
            let p_category: ServiceCategory
            let p_start: Date
            let p_end: Date
            let p_mode: BillingMode
            let p_dependents: Int
            let p_trips_km: Double
            let p_requires_specialty: Bool
            let p_notes: String
        }
        struct Created: Decodable { let id: UUID }
        let request = new.request
        let created: Created = try await client.call("create_booking", Params(
            p_caregiver_id: new.caregiverId, p_address_id: new.addressId, p_category: request.category,
            p_start: request.start, p_end: request.end, p_mode: request.mode, p_dependents: request.dependents,
            p_trips_km: request.tripsDuringServiceKm, p_requires_specialty: request.requiresSpecialty,
            p_notes: new.notes))
        return try await detail(created.id)
    }

    func myBookings() async throws -> [Booking] {
        try await client.call("my_bookings")
    }

    func send(_ event: BookingEvent, bookingId: UUID) async throws -> Booking {
        struct Params: Encodable, Sendable {
            let p_booking_id: UUID
            let p_event: String
            let p_pin: String?
        }
        let (name, pin): (String, String?) = switch event {
        case .accept: ("accept", nil)
        case .decline: ("decline", nil)
        case .startTrip: ("start_trip", nil)
        case .startService(let pin): ("start", pin)
        case .finish: ("finish", nil)
        case .cancel: ("cancel", nil)
        case .openDispute: ("dispute", nil)
        case .review: throw BookingTransitionError.notAllowed(from: .completed, event: event)
        }
        do {
            try await client.rpc("booking_transition", params: Params(p_booking_id: bookingId, p_event: name, p_pin: pin)).execute()
        } catch let error as PostgrestError where error.message == "wrong_pin" {
            throw BookingTransitionError.wrongPin
        }
        return try await detail(bookingId)
    }

    func review(bookingId: UUID, rating: Int, tags: [String], comment: String?) async throws {
        struct Params: Encodable, Sendable {
            let p_booking_id: UUID
            let p_rating: Int
            let p_tags: [String]
            let p_comment: String?
        }
        try await client.rpc("submit_review", params: Params(
            p_booking_id: bookingId, p_rating: rating, p_tags: tags, p_comment: comment)).execute()
    }

    private func detail(_ id: UUID) async throws -> Booking {
        try await client.call("booking_detail", ["p_booking_id": id])
    }
}

struct SupabaseCaregiverWorkRepository: CaregiverWorkRepository {
    let client: SupabaseClient

    func verifications() async throws -> [Verification] {
        struct Row: Decodable {
            let kind: VerificationKind
            let status: VerificationStatus
        }
        let rows: [Row] = try await client.from("verifications").select("kind, status").execute().value
        // Mostra também os passos que ainda não começaram.
        return VerificationKind.allCases.map { kind in
            Verification(kind: kind, status: rows.first { $0.kind == kind }?.status ?? .pending)
        }
    }

    func setAvailable(_ available: Bool) async throws {
        guard let user = client.auth.currentUser else { return }
        try await client.from("caregiver_profiles").update(["available_now": available]).eq("profile_id", value: user.id).execute()
    }

    func incomingRequests() async throws -> [Booking] {
        let all: [Booking] = try await client.call("my_bookings")
        return all.filter { $0.status == .requested }
    }
}

struct SupabaseSafetyRepository: SafetyRepository {
    let client: SupabaseClient

    func triggerEmergency(bookingId: UUID?, location: Coordinate?) async throws {
        struct Params: Encodable, Sendable {
            let p_booking_id: UUID?
            let p_lat: Double?
            let p_lng: Double?
        }
        try await client.rpc("trigger_emergency", params: Params(
            p_booking_id: bookingId, p_lat: location?.latitude, p_lng: location?.longitude)).execute()
    }
}
