import Core
import Foundation
import Observation

/// Tudo que as telas precisam para buscar e gravar dados.
/// O app escolhe a versão Supabase ou a de exemplo (mock) ao iniciar.
public struct Dependencies: Sendable {
    public var auth: any AuthRepository
    public var caregivers: any CaregiverRepository
    public var pricing: any PricingRepository
    public var bookings: any BookingRepository
    public var work: any CaregiverWorkRepository
    public var safety: any SafetyRepository
    /// Verdadeiro no modo de exemplo: mostra botões para simular o lado do cuidador.
    public var isDemo: Bool

    public init(
        auth: any AuthRepository, caregivers: any CaregiverRepository, pricing: any PricingRepository,
        bookings: any BookingRepository, work: any CaregiverWorkRepository, safety: any SafetyRepository,
        isDemo: Bool
    ) {
        self.auth = auth
        self.caregivers = caregivers
        self.pricing = pricing
        self.bookings = bookings
        self.work = work
        self.safety = safety
        self.isDemo = isDemo
    }

    public static func demo() -> Dependencies {
        let store = MockStore()
        return Dependencies(
            auth: MockAuthRepository(store: store), caregivers: MockCaregiverRepository(),
            pricing: MockPricingRepository(), bookings: MockBookingRepository(store: store),
            work: MockCaregiverWorkRepository(store: store), safety: MockSafetyRepository(), isDemo: true
        )
    }
}

@MainActor
@Observable
public final class AppModel {
    public enum Phase: Equatable {
        case loading, signedOut, choosingRole, client, caregiver
    }

    public let deps: Dependencies
    public private(set) var phase: Phase = .loading
    public private(set) var session: Session?

    /// Endereço do atendimento. No MVP vem do cadastro; aqui começa com o de exemplo.
    public var address: Address = MockData.home

    public init(deps: Dependencies) {
        self.deps = deps
    }

    public func start() async {
        apply(await deps.auth.currentSession())
    }

    public func signedIn(_ session: Session) {
        apply(session)
    }

    public func signOut() async {
        try? await deps.auth.signOut()
        apply(nil)
    }

    private func apply(_ session: Session?) {
        self.session = session
        guard let session else {
            phase = .signedOut
            return
        }
        switch session.role {
        case nil: phase = .choosingRole
        case .client: phase = .client
        case .caregiver: phase = .caregiver
        }
    }
}

/// Converte erros técnicos em mensagens que a pessoa entende.
func friendlyMessage(for error: Error) -> String {
    switch error {
    case BookingTransitionError.wrongPin: "Código incorreto. Confira o código no app do cliente."
    case PricingError.endBeforeStart: "O horário de término precisa ser depois do início."
    case is URLError: "Sem conexão. Verifique a internet e tente de novo."
    default: "Algo deu errado. Tente de novo em instantes."
    }
}
