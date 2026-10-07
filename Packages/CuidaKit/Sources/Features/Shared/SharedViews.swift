import Core
import DesignSystem
import SwiftUI

/// Detalhamento do preço: tempo, deslocamento, adicionais e total.
struct PriceBreakdownView: View {
    let price: PriceBreakdown
    var showsPayout = false

    var body: some View {
        VStack(spacing: 10) {
            ValueRow(timeLabel, price.timeAmount.brl)
            if price.longStayDiscount > 0 { ValueRow("Desconto de pacote", "−" + price.longStayDiscount.brl) }
            if price.surcharge > 0 { ValueRow(surchargeLabel, price.surcharge.brl) }
            if price.dependentsExtra > 0 { ValueRow("Adicional por mais pessoas ou pets", price.dependentsExtra.brl) }
            if price.specialtyExtra > 0 { ValueRow("Especialidade", price.specialtyExtra.brl) }
            ValueRow("Deslocamento até o local", price.travelToLocation.brl)
            if price.travelDuringService > 0 { ValueRow("Deslocamentos no serviço", price.travelDuringService.brl) }
            Divider()
            ValueRow("Total", price.total.brl, emphasized: true)
            if showsPayout {
                ValueRow("Taxa do app", "−" + price.platformFee.brl)
                ValueRow("Você recebe", price.caregiverPayout.brl, emphasized: true)
            }
        }
    }

    private var timeLabel: String {
        switch price.mode {
        case .hourly: price.billedUnits == 1 ? "1 hora" : "\(price.billedUnits) horas"
        case .daily: price.billedUnits == 1 ? "1 diária" : "\(price.billedUnits) diárias"
        }
    }

    private var surchargeLabel: String {
        switch price.surchargeReason {
        case .night: "Adicional noturno"
        case .weekend: "Adicional de fim de semana"
        case .holiday: "Adicional de feriado"
        case nil: "Adicional"
        }
    }
}

/// Botão de emergência: confirma, registra no backend com a localização e liga para o 190.
struct EmergencyButton: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let bookingId: UUID?
    @State private var confirming = false

    var body: some View {
        Button {
            confirming = true
        } label: {
            Label("Emergência", systemImage: "sos")
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(.white)
                .background(Theme.danger, in: RoundedRectangle(cornerRadius: Theme.corner))
        }
        .confirmationDialog("Precisa de ajuda?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Ligar para a polícia (190)", role: .destructive) { call("190") }
            Button("Ligar para o SAMU (192)", role: .destructive) { call("192") }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Seus contatos de emergência serão avisados com a sua localização.")
        }
    }

    private func call(_ number: String) {
        Task { try? await model.deps.safety.triggerEmergency(bookingId: bookingId, location: model.address.coordinate) }
        if let url = URL(string: "tel://\(number)") { openURL(url) }
    }
}

/// Acompanhamento da reserva, do pedido até a avaliação. Serve ao cliente e ao cuidador.
struct LiveServiceView: View {
    @Environment(AppModel.self) private var model
    private let bookingId: UUID
    @State private var booking: Booking?
    @State private var pinInput = ""
    @State private var error: String?
    @State private var rating = 5

    init(bookingId: UUID) {
        self.bookingId = bookingId
    }

    private var isCaregiver: Bool { model.phase == .caregiver }

    var body: some View {
        ScrollView {
            if let booking {
                VStack(alignment: .leading, spacing: 20) {
                    Text(booking.status.title).font(.display)
                    HStack(spacing: 14) {
                        Avatar(name: isCaregiver ? booking.clientName : booking.caregiver.name,
                               url: isCaregiver ? nil : booking.caregiver.photoURL)
                        VStack(alignment: .leading) {
                            Text(isCaregiver ? booking.clientName : booking.caregiver.name).font(.headline)
                            Text("\(booking.start.formatted(date: .abbreviated, time: .shortened)) até \(booking.end.formatted(date: .omitted, time: .shortened))")
                                .foregroundStyle(Theme.muted)
                        }
                    }

                    if !isCaregiver, [.accepted, .onTheWay].contains(booking.status) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Código de início").font(.label)
                            Text(booking.startPin)
                                .font(.system(size: 44, weight: .bold, design: .monospaced))
                                .tracking(8)
                            Text("Mostre este código quando o cuidador chegar. Só passe o código pessoalmente.")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
                    }

                    if isCaregiver, [.accepted, .onTheWay].contains(booking.status) {
                        TextField("Código de 4 dígitos do cliente", text: $pinInput)
                            .keyboardType(.numberPad)
                            .font(.title2.monospacedDigit())
                            .padding()
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
                    }

                    actions(for: booking)

                    if let error { Text(error).foregroundStyle(Theme.danger) }

                    if booking.status.isActive {
                        EmergencyButton(bookingId: booking.id)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Valor").font(.label)
                        PriceBreakdownView(price: booking.price, showsPayout: isCaregiver)
                    }

                    if !booking.notes.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Observações").font(.label)
                            Text(booking.notes)
                        }
                    }
                }
                .padding(Theme.padding)
            } else {
                ProgressView().padding(.top, 80)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    @ViewBuilder
    private func actions(for booking: Booking) -> some View {
        VStack(spacing: 10) {
            switch (booking.status, isCaregiver) {
            case (.requested, true):
                Button("Aceitar") { send(.accept) }.buttonStyle(PrimaryButtonStyle())
                Button("Recusar") { send(.decline) }.buttonStyle(SecondaryButtonStyle())
            case (.accepted, true):
                Button("Estou a caminho") { send(.startTrip) }.buttonStyle(SecondaryButtonStyle())
                Button("Iniciar com o código") { send(.startService(pin: pinInput)) }
                    .buttonStyle(PrimaryButtonStyle()).disabled(pinInput.count != 4)
            case (.onTheWay, true):
                Button("Iniciar com o código") { send(.startService(pin: pinInput)) }
                    .buttonStyle(PrimaryButtonStyle()).disabled(pinInput.count != 4)
            case (.inProgress, true):
                Button("Encerrar serviço") { send(.finish) }.buttonStyle(PrimaryButtonStyle())
            case (.completed, _):
                Stepper("Sua nota: \(rating) de 5", value: $rating, in: 1...5)
                Button("Enviar avaliação") { review() }.buttonStyle(PrimaryButtonStyle())
            case (.requested, false), (.accepted, false), (.onTheWay, false):
                Button("Cancelar reserva", role: .destructive) { send(.cancel) }.buttonStyle(SecondaryButtonStyle())
                if model.deps.isDemo { demoControls(for: booking) }
            case (.inProgress, false):
                if model.deps.isDemo { demoControls(for: booking) }
            default:
                EmptyView()
            }
        }
    }

    /// Só no modo de exemplo: simula o lado do cuidador para testar o fluxo completo sozinho.
    @ViewBuilder
    private func demoControls(for booking: Booking) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Simular cuidador (modo de exemplo)").font(.caption).foregroundStyle(Theme.muted)
            HStack {
                if booking.status == .requested { Button("Aceitar") { send(.accept) } }
                if booking.status == .accepted { Button("A caminho") { send(.startTrip) } }
                if [.accepted, .onTheWay].contains(booking.status) {
                    Button("Iniciar") { send(.startService(pin: booking.startPin)) }
                }
                if booking.status == .inProgress { Button("Encerrar") { send(.finish) } }
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func reload() async {
        booking = try? await model.deps.bookings.myBookings().first { $0.id == bookingId }
    }

    private func send(_ event: BookingEvent) {
        error = nil
        Task {
            do {
                booking = try await model.deps.bookings.send(event, bookingId: bookingId)
                pinInput = ""
            } catch {
                self.error = friendlyMessage(for: error)
            }
        }
    }

    private func review() {
        Task {
            try? await model.deps.bookings.review(bookingId: bookingId, rating: rating, tags: [], comment: nil)
            await reload()
        }
    }
}
