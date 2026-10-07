import Foundation
import Testing
@testable import Core

/// Os mesmos casos existem em `supabase/tests/pricing_test.sql`, para garantir
/// que o app e o backend calculam o mesmo valor.
struct PricingEngineTests {
    let engine = PricingEngine()

    /// Data/hora no fuso de São Paulo, ex.: date("2026-10-07 14:00").
    func date(_ text: String) -> Date {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Sao_Paulo")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: text)!
    }

    @Test func weekdayAfternoonByHour() throws {
        let request = QuoteRequest(category: .nanny, start: date("2026-10-07 14:00"), end: date("2026-10-07 18:00"),
                                   mode: .hourly, distanceToLocationKm: 3)
        let price = try engine.quote(request, rule: MockData.rule(for: .nanny))
        #expect(price.billedUnits == 4)
        #expect(price.timeAmount == 14_000)
        #expect(price.surcharge == 0)
        #expect(price.travelToLocation == 1_700)
        #expect(price.total == 15_700)
        #expect(price.platformFee == 2_826)
        #expect(price.caregiverPayout == 12_874)
    }

    @Test func minimumHoursApply() throws {
        let request = QuoteRequest(category: .nanny, start: date("2026-10-07 14:00"), end: date("2026-10-07 15:00"),
                                   mode: .hourly, distanceToLocationKm: 0)
        let price = try engine.quote(request, rule: MockData.rule(for: .nanny))
        #expect(price.billedUnits == 3)
        #expect(price.timeAmount == 10_500)
        #expect(price.total == 11_300)
        #expect(price.platformFee == 2_034)
    }

    @Test func onlyTheHighestSurchargeCountsAndExtraChildren() throws {
        // Sábado à noite: fim de semana (15%) e noturno (20%); vale só o noturno.
        let request = QuoteRequest(category: .nanny, start: date("2026-10-10 20:00"), end: date("2026-10-10 23:00"),
                                   mode: .hourly, dependents: 2, distanceToLocationKm: 2)
        let price = try engine.quote(request, rule: MockData.rule(for: .nanny))
        #expect(price.surchargeReason == .night)
        #expect(price.surcharge == 2_100)
        #expect(price.dependentsExtra == 2_625)
        #expect(price.travelToLocation == 1_400)
        #expect(price.total == 16_625)
        #expect(price.platformFee == 2_993)
        #expect(price.caregiverPayout == 13_632)
    }

    @Test func dailyWithLongStayDiscountSpecialtyAndTrips() throws {
        let request = QuoteRequest(category: .elderCare, start: date("2026-10-12 08:00"), end: date("2026-10-17 08:00"),
                                   mode: .daily, distanceToLocationKm: 4, tripsDuringServiceKm: 10, requiresSpecialty: true)
        let price = try engine.quote(request, rule: MockData.rule(for: .elderCare))
        #expect(price.billedUnits == 5)
        #expect(price.timeAmount == 140_000)
        #expect(price.longStayDiscount == 14_000)
        #expect(price.specialtyExtra == 31_500)
        #expect(price.travelToLocation == 2_000)
        #expect(price.travelDuringService == 1_500)
        #expect(price.total == 161_000)
        #expect(price.platformFee == 28_980)
        #expect(price.caregiverPayout == 132_020)
    }

    @Test func holidaySurcharge() throws {
        let request = QuoteRequest(category: .nanny, start: date("2026-10-07 14:00"), end: date("2026-10-07 18:00"),
                                   mode: .hourly, distanceToLocationKm: 0, isHoliday: true)
        let price = try engine.quote(request, rule: MockData.rule(for: .nanny))
        #expect(price.surchargeReason == .holiday)
        #expect(price.surcharge == 7_000)
    }

    @Test func rejectsInvalidRequests() {
        let rule = MockData.rule(for: .nanny)
        let backwards = QuoteRequest(category: .nanny, start: date("2026-10-07 18:00"), end: date("2026-10-07 14:00"),
                                     mode: .hourly, distanceToLocationKm: 0)
        #expect(throws: PricingError.endBeforeStart) { try engine.quote(backwards, rule: rule) }

        let noOne = QuoteRequest(category: .nanny, start: date("2026-10-07 14:00"), end: date("2026-10-07 18:00"),
                                 mode: .hourly, dependents: 0, distanceToLocationKm: 0)
        #expect(throws: PricingError.invalidDependents) { try engine.quote(noOne, rule: rule) }
    }
}

struct BookingStateMachineTests {
    @Test func happyPath() throws {
        var status = BookingStatus.requested
        status = try BookingStateMachine.next(from: status, on: .accept, expectedPin: "1234")
        status = try BookingStateMachine.next(from: status, on: .startTrip, expectedPin: "1234")
        status = try BookingStateMachine.next(from: status, on: .startService(pin: "1234"), expectedPin: "1234")
        status = try BookingStateMachine.next(from: status, on: .finish, expectedPin: "1234")
        status = try BookingStateMachine.next(from: status, on: .review, expectedPin: "1234")
        #expect(status == .reviewed)
    }

    @Test func wrongPinDoesNotStart() {
        #expect(throws: BookingTransitionError.wrongPin) {
            try BookingStateMachine.next(from: .accepted, on: .startService(pin: "0000"), expectedPin: "1234")
        }
    }

    @Test func cannotCancelAfterServiceStarted() {
        #expect(throws: BookingTransitionError.notAllowed(from: .inProgress, event: .cancel)) {
            try BookingStateMachine.next(from: .inProgress, on: .cancel, expectedPin: "1234")
        }
    }
}
