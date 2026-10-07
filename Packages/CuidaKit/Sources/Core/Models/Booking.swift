import Foundation

public enum BookingStatus: String, Codable, CaseIterable, Sendable {
    case requested = "solicitada"
    case accepted = "aceita"
    case onTheWay = "a_caminho"
    case inProgress = "em_andamento"
    case completed = "concluida"
    case reviewed = "avaliada"
    case declined = "recusada"
    case cancelled = "cancelada"
    case disputed = "em_disputa"

    public var title: String {
        switch self {
        case .requested: "Aguardando o cuidador"
        case .accepted: "Confirmada"
        case .onTheWay: "A caminho"
        case .inProgress: "Em andamento"
        case .completed: "Concluída"
        case .reviewed: "Avaliada"
        case .declined: "Recusada"
        case .cancelled: "Cancelada"
        case .disputed: "Em análise"
        }
    }

    public var isActive: Bool {
        [.requested, .accepted, .onTheWay, .inProgress].contains(self)
    }
}

public enum BookingEvent: Sendable, Equatable {
    case accept, decline, startTrip, startService(pin: String), finish, review, cancel, openDispute
}

public enum BookingTransitionError: Error, Equatable, Sendable {
    case notAllowed(from: BookingStatus, event: BookingEvent)
    case wrongPin
}

/// Regras de quais mudanças de estado são permitidas. O backend aplica as mesmas regras
/// (funções `accept_booking`, `start_booking` etc.); aqui servem para a interface
/// mostrar só os botões que fazem sentido.
public enum BookingStateMachine {
    public static func next(from status: BookingStatus, on event: BookingEvent, expectedPin: String) throws -> BookingStatus {
        switch (status, event) {
        case (.requested, .accept): return .accepted
        case (.requested, .decline): return .declined
        case (.accepted, .startTrip): return .onTheWay
        case (.accepted, .startService(let pin)), (.onTheWay, .startService(let pin)):
            guard pin == expectedPin else { throw BookingTransitionError.wrongPin }
            return .inProgress
        case (.inProgress, .finish): return .completed
        case (.completed, .review): return .reviewed
        case (.requested, .cancel), (.accepted, .cancel), (.onTheWay, .cancel): return .cancelled
        case (.inProgress, .openDispute), (.completed, .openDispute): return .disputed
        default: throw BookingTransitionError.notAllowed(from: status, event: event)
        }
    }
}

public struct Booking: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var category: ServiceCategory
    public var caregiver: Caregiver
    public var clientName: String
    public var address: Address
    public var start: Date
    public var end: Date
    public var status: BookingStatus
    /// Código de 4 dígitos que o cliente mostra e o cuidador digita para iniciar.
    public var startPin: String
    public var notes: String
    public var price: PriceBreakdown

    public init(
        id: UUID = UUID(), category: ServiceCategory, caregiver: Caregiver, clientName: String,
        address: Address, start: Date, end: Date, status: BookingStatus, startPin: String,
        notes: String, price: PriceBreakdown
    ) {
        self.id = id
        self.category = category
        self.caregiver = caregiver
        self.clientName = clientName
        self.address = address
        self.start = start
        self.end = end
        self.status = status
        self.startPin = startPin
        self.notes = notes
        self.price = price
    }
}
