import Foundation

/// Tarifas de uma categoria numa cidade. Vêm da tabela `pricing_rules` do backend,
/// então dá para mudar preços sem publicar versão nova do app.
/// Percentuais em pontos-base: 100 = 1%.
public struct PricingRule: Codable, Hashable, Sendable {
    public var category: ServiceCategory
    public var city: String
    public var hourlyRate: Cents
    public var dailyRate: Cents
    public var minimumHours: Int
    /// A partir de quantas diárias entra o desconto de pacote longo.
    public var longStayDays: Int
    public var longStayDiscountBp: Int
    public var travelBaseFee: Cents
    public var perKmRate: Cents
    public var nightSurchargeBp: Int
    public var weekendSurchargeBp: Int
    public var holidaySurchargeBp: Int
    /// Acréscimo por criança/pet/pessoa além da primeira.
    public var extraDependentBp: Int
    public var specialtySurchargeBp: Int
    /// Taxa da empresa sobre o total, descontada no repasse ao cuidador.
    public var platformFeeBp: Int

    public init(
        category: ServiceCategory, city: String, hourlyRate: Cents, dailyRate: Cents, minimumHours: Int,
        longStayDays: Int, longStayDiscountBp: Int, travelBaseFee: Cents, perKmRate: Cents,
        nightSurchargeBp: Int, weekendSurchargeBp: Int, holidaySurchargeBp: Int,
        extraDependentBp: Int, specialtySurchargeBp: Int, platformFeeBp: Int
    ) {
        self.category = category
        self.city = city
        self.hourlyRate = hourlyRate
        self.dailyRate = dailyRate
        self.minimumHours = minimumHours
        self.longStayDays = longStayDays
        self.longStayDiscountBp = longStayDiscountBp
        self.travelBaseFee = travelBaseFee
        self.perKmRate = perKmRate
        self.nightSurchargeBp = nightSurchargeBp
        self.weekendSurchargeBp = weekendSurchargeBp
        self.holidaySurchargeBp = holidaySurchargeBp
        self.extraDependentBp = extraDependentBp
        self.specialtySurchargeBp = specialtySurchargeBp
        self.platformFeeBp = platformFeeBp
    }
}

public enum BillingMode: String, Codable, Sendable {
    case hourly = "hora"
    case daily = "diaria"
}

/// O que o cliente pediu: quando, quanto tempo, para quantos e com quais deslocamentos.
public struct QuoteRequest: Codable, Hashable, Sendable {
    public var category: ServiceCategory
    public var start: Date
    public var end: Date
    public var mode: BillingMode
    public var dependents: Int
    /// Distância de ida entre o cuidador e o endereço; o cálculo cobra ida e volta.
    public var distanceToLocationKm: Double
    /// Deslocamentos durante o serviço (médico, escola, veterinário), em km totais.
    public var tripsDuringServiceKm: Double
    public var requiresSpecialty: Bool
    public var isHoliday: Bool

    public init(
        category: ServiceCategory, start: Date, end: Date, mode: BillingMode, dependents: Int = 1,
        distanceToLocationKm: Double, tripsDuringServiceKm: Double = 0,
        requiresSpecialty: Bool = false, isHoliday: Bool = false
    ) {
        self.category = category
        self.start = start
        self.end = end
        self.mode = mode
        self.dependents = dependents
        self.distanceToLocationKm = distanceToLocationKm
        self.tripsDuringServiceKm = tripsDuringServiceKm
        self.requiresSpecialty = requiresSpecialty
        self.isHoliday = isHoliday
    }
}

public struct PriceBreakdown: Codable, Hashable, Sendable {
    /// Horas cobradas (modo hora) ou diárias (modo diária).
    public var billedUnits: Int
    public var mode: BillingMode
    public var timeAmount: Cents
    public var longStayDiscount: Cents
    public var surcharge: Cents
    public var surchargeReason: SurchargeReason?
    public var dependentsExtra: Cents
    public var specialtyExtra: Cents
    public var travelToLocation: Cents
    public var travelDuringService: Cents
    public var total: Cents
    public var platformFee: Cents
    public var caregiverPayout: Cents

    public enum SurchargeReason: String, Codable, Sendable {
        case night = "noturno"
        case weekend = "fim_de_semana"
        case holiday = "feriado"
    }
}

public enum PricingError: Error, Equatable, Sendable {
    case endBeforeStart
    case invalidDependents
    case negativeDistance
}

/// Calcula o valor sugerido de uma reserva.
///
/// Este cálculo existe também no backend (`quote_price` em SQL), que é quem vale na hora de cobrar.
/// No app ele serve para mostrar a estimativa na hora, sem esperar a rede. Mantenha os dois iguais:
/// os testes em `PricingEngineTests` têm os mesmos casos de `supabase/tests/pricing_test.sql`.
public struct PricingEngine: Sendable {
    public var calendar: Calendar

    /// Janela noturna: das 22h às 6h.
    public static let nightStartHour = 22
    public static let nightEndHour = 6

    public init(timeZone: TimeZone = TimeZone(identifier: "America/Sao_Paulo")!) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        self.calendar = calendar
    }

    public func quote(_ request: QuoteRequest, rule: PricingRule) throws -> PriceBreakdown {
        guard request.end > request.start else { throw PricingError.endBeforeStart }
        guard request.dependents >= 1 else { throw PricingError.invalidDependents }
        guard request.distanceToLocationKm >= 0, request.tripsDuringServiceKm >= 0 else {
            throw PricingError.negativeDistance
        }

        let minutes = Int(request.end.timeIntervalSince(request.start) / 60)

        var billedUnits: Int
        var timeAmount: Cents
        var discount: Cents = 0
        var surcharge: Cents = 0
        var surchargeReason: PriceBreakdown.SurchargeReason?

        switch request.mode {
        case .hourly:
            let billableMinutes = max(minutes, rule.minimumHours * 60)
            billedUnits = Int((Double(billableMinutes) / 60).rounded(.up))
            timeAmount = Self.round(Double(rule.hourlyRate * billableMinutes) / 60)

            // Só o maior acréscimo vale (noite, fim de semana ou feriado não se somam).
            var candidates: [(Int, PriceBreakdown.SurchargeReason)] = []
            if request.isHoliday { candidates.append((rule.holidaySurchargeBp, .holiday)) }
            if isWeekend(request.start) { candidates.append((rule.weekendSurchargeBp, .weekend)) }
            if touchesNight(start: request.start, end: request.end) { candidates.append((rule.nightSurchargeBp, .night)) }
            if let best = candidates.filter({ $0.0 > 0 }).max(by: { $0.0 < $1.0 }) {
                surcharge = Self.applyBp(timeAmount, best.0)
                surchargeReason = best.1
            }

        case .daily:
            billedUnits = Int((Double(minutes) / 1440).rounded(.up))
            timeAmount = rule.dailyRate * billedUnits
            if billedUnits >= rule.longStayDays {
                discount = Self.applyBp(timeAmount, rule.longStayDiscountBp)
            }
        }

        let netTime = timeAmount - discount
        let dependentsExtra = Self.applyBp(netTime, rule.extraDependentBp * (request.dependents - 1))
        let specialtyExtra = request.requiresSpecialty ? Self.applyBp(netTime, rule.specialtySurchargeBp) : 0
        let travelToLocation = rule.travelBaseFee + Self.round(Double(rule.perKmRate) * request.distanceToLocationKm * 2)
        let travelDuringService = Self.round(Double(rule.perKmRate) * request.tripsDuringServiceKm)

        let total = netTime + surcharge + dependentsExtra + specialtyExtra + travelToLocation + travelDuringService
        let platformFee = Self.applyBp(total, rule.platformFeeBp)

        return PriceBreakdown(
            billedUnits: billedUnits,
            mode: request.mode,
            timeAmount: timeAmount,
            longStayDiscount: discount,
            surcharge: surcharge,
            surchargeReason: surchargeReason,
            dependentsExtra: dependentsExtra,
            specialtyExtra: specialtyExtra,
            travelToLocation: travelToLocation,
            travelDuringService: travelDuringService,
            total: total,
            platformFee: platformFee,
            caregiverPayout: total - platformFee
        )
    }

    func isWeekend(_ date: Date) -> Bool {
        let weekday = calendar.component(.weekday, from: date)
        return weekday == 1 || weekday == 7
    }

    /// Verdadeiro se qualquer parte do intervalo cai entre 22h e 6h (checado a cada 30 minutos).
    func touchesNight(start: Date, end: Date) -> Bool {
        var cursor = start
        while cursor < end {
            let hour = calendar.component(.hour, from: cursor)
            if hour >= Self.nightStartHour || hour < Self.nightEndHour { return true }
            cursor = cursor.addingTimeInterval(30 * 60)
        }
        return false
    }

    static func applyBp(_ amount: Cents, _ bp: Int) -> Cents {
        round(Double(amount) * Double(bp) / 10_000)
    }

    /// Arredonda meio centavo para longe do zero, igual ao `round()` do Postgres.
    static func round(_ value: Double) -> Cents {
        Int(value.rounded(.toNearestOrAwayFromZero))
    }
}

public extension Cents {
    /// Formata centavos como "R$ 1.234,56".
    var brl: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "pt_BR")
        return formatter.string(from: NSNumber(value: Double(self) / 100)) ?? "R$ \(self / 100)"
    }
}
