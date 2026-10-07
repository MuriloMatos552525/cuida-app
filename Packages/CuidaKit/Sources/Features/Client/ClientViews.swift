import Core
import DesignSystem
import SwiftUI

/// O que o cliente está montando antes de escolher o cuidador.
struct BookingDraft: Hashable {
    var category: ServiceCategory
    var start: Date = Calendar.current.nextDate(after: .now, matching: DateComponents(minute: 0), matchingPolicy: .nextTime) ?? .now
    var mode: BillingMode = .hourly
    var hours: Int = 4
    var days: Int = 1
    var dependents: Int = 1
    var tripsKm: Double = 0
    var specialtyIds: Set<String> = []
    var notes: String = ""

    var end: Date {
        switch mode {
        case .hourly: start.addingTimeInterval(TimeInterval(hours) * 3600)
        case .daily: start.addingTimeInterval(TimeInterval(days) * 86_400)
        }
    }

    func quoteRequest(distanceKm: Double) -> QuoteRequest {
        QuoteRequest(category: category, start: start, end: end, mode: mode, dependents: dependents,
                     distanceToLocationKm: distanceKm, tripsDuringServiceKm: tripsKm,
                     requiresSpecialty: !specialtyIds.isEmpty)
    }
}

enum ClientRoute: Hashable {
    case results(BookingDraft)
    case caregiver(CaregiverResult, BookingDraft)
    case confirm(CaregiverResult, BookingDraft)
    case booking(UUID)
}

struct ClientTabView: View {
    var body: some View {
        TabView {
            ClientHomeView()
                .tabItem { Label("Início", systemImage: "house") }
            BookingsListView()
                .tabItem { Label("Reservas", systemImage: "calendar") }
            AccountView()
                .tabItem { Label("Conta", systemImage: "person.crop.circle") }
        }
    }
}

// MARK: - Início

struct ClientHomeView: View {
    @Environment(AppModel.self) private var model
    @State private var path: [ClientRoute] = []
    @State private var draft: BookingDraft?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(greeting).font(.display)
                    Label(model.address.street, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .padding(.bottom, 8)

                    ForEach(ServiceCategory.allCases) { category in
                        Button {
                            draft = BookingDraft(category: category)
                        } label: {
                            CategoryCard(title: category.title, subtitle: category.subtitle, symbol: category.symbol)
                        }
                        .buttonStyle(.plain)
                    }

                    VerifiedBadge("Todos os cuidadores têm CPF, rosto e antecedentes verificados", symbol: "lock.shield.fill")
                        .padding(.top, 8)
                }
                .padding(Theme.padding)
            }
            .sheet(item: $draft) { draft in
                BookingRequestView(draft: draft) { ready in
                    self.draft = nil
                    path.append(.results(ready))
                }
                .presentationDetents([.large])
            }
            .navigationDestination(for: ClientRoute.self) { route in
                switch route {
                case .results(let draft):
                    SearchResultsView(draft: draft, path: $path)
                case .caregiver(let result, let draft):
                    CaregiverProfileView(result: result, draft: draft, path: $path)
                case .confirm(let result, let draft):
                    ConfirmBookingView(result: result, draft: draft, path: $path)
                case .booking(let id):
                    LiveServiceView(bookingId: id)
                }
            }
        }
    }

    private var greeting: String {
        let first = model.session?.name.split(separator: " ").first.map(String.init) ?? ""
        return first.isEmpty ? "Olá!" : "Olá, \(first)!"
    }
}

extension BookingDraft: Identifiable {
    var id: ServiceCategory { category }
}

// MARK: - Quando e detalhes

struct BookingRequestView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var draft: BookingDraft
    let onSearch: (BookingDraft) -> Void
    @State private var specialties: [Specialty] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Quando") {
                    DatePicker("Início", selection: $draft.start, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
                    Picker("Cobrança", selection: $draft.mode) {
                        Text("Por hora").tag(BillingMode.hourly)
                        Text("Por diária").tag(BillingMode.daily)
                    }
                    .pickerStyle(.segmented)
                    if draft.mode == .hourly {
                        Stepper("\(draft.hours) horas", value: $draft.hours, in: 1...12)
                    } else {
                        Stepper(draft.days == 1 ? "1 diária" : "\(draft.days) diárias", value: $draft.days, in: 1...30)
                    }
                }

                Section("Para quem") {
                    let noun = draft.category.dependentNoun
                    Stepper("\(draft.dependents) \(draft.dependents == 1 ? noun.singular : noun.plural)",
                            value: $draft.dependents, in: 1...5)
                    if !specialties.isEmpty {
                        ForEach(specialties) { specialty in
                            Toggle(specialty.name, isOn: Binding(
                                get: { draft.specialtyIds.contains(specialty.id) },
                                set: { on in
                                    if on { draft.specialtyIds.insert(specialty.id) } else { draft.specialtyIds.remove(specialty.id) }
                                }
                            ))
                        }
                    }
                }

                Section {
                    Stepper(value: $draft.tripsKm, in: 0...100, step: 5) {
                        Text(draft.tripsKm == 0 ? "Sem deslocamentos" : "\(Int(draft.tripsKm)) km de deslocamentos")
                    }
                } header: {
                    Text("Deslocamentos durante o serviço")
                } footer: {
                    Text(tripsHint)
                }

                Section("Observações") {
                    TextField("Rotina, alergias, cuidados especiais", text: $draft.notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(draft.category.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fechar") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                Button("Ver cuidadores disponíveis") { onSearch(draft) }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(Theme.padding)
                    .background(.bar)
            }
            .task {
                specialties = (try? await model.deps.caregivers.specialties(for: draft.category)) ?? []
            }
        }
    }

    private var tripsHint: String {
        switch draft.category {
        case .nanny: "Ex.: levar e buscar na escola ou em atividades."
        case .petSitter: "Ex.: ida ao veterinário ou ao banho e tosa."
        case .elderCare: "Ex.: acompanhar em consultas e exames."
        }
    }
}

// MARK: - Resultados

struct SearchResultsView: View {
    @Environment(AppModel.self) private var model
    let draft: BookingDraft
    @Binding var path: [ClientRoute]
    @State private var results: [CaregiverResult]?
    @State private var error: String?

    var body: some View {
        Group {
            if let results {
                if results.isEmpty {
                    ContentUnavailableView("Ninguém disponível nesse horário",
                                           systemImage: "person.crop.circle.badge.questionmark",
                                           description: Text("Tente outro horário ou remova alguma especialidade."))
                } else {
                    List(results) { result in
                        Button { path.append(.caregiver(result, draft)) } label: {
                            CaregiverRow(result: result)
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            } else if let error {
                ContentUnavailableView("Não foi possível buscar", systemImage: "wifi.slash", description: Text(error))
            } else {
                ProgressView("Buscando cuidadores verificados…")
            }
        }
        .navigationTitle(draft.category.title)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let query = SearchQuery(category: draft.category, location: model.address.coordinate,
                                    start: draft.start, end: draft.end, specialtyIds: draft.specialtyIds)
            results = try await model.deps.caregivers.search(query, request: draft.quoteRequest(distanceKm: 0))
        } catch {
            self.error = friendlyMessage(for: error)
        }
    }
}

struct CaregiverRow: View {
    let result: CaregiverResult

    var body: some View {
        HStack(spacing: 14) {
            Avatar(name: result.caregiver.name, url: result.caregiver.photoURL)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(result.caregiver.name).font(.headline)
                    if result.caregiver.isIdentityVerified {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.accent)
                            .accessibilityLabel("Verificado")
                    }
                }
                HStack(spacing: 8) {
                    RatingView(result.caregiver.rating, count: result.caregiver.reviewCount)
                    Text("· \(result.distanceKm, format: .number.precision(.fractionLength(1))) km")
                        .foregroundStyle(Theme.muted)
                        .font(.subheadline)
                }
                if let first = result.caregiver.specialties.first {
                    Text(first.name).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Text(result.estimatedTotal.brl).font(.headline).monospacedDigit()
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}

// MARK: - Perfil do cuidador

struct CaregiverProfileView: View {
    @Environment(AppModel.self) private var model
    let result: CaregiverResult
    let draft: BookingDraft
    @Binding var path: [ClientRoute]
    @State private var reviews: [Review] = []

    private var caregiver: Caregiver { result.caregiver }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 16) {
                    Avatar(name: caregiver.name, url: caregiver.photoURL, size: 88)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(caregiver.name).font(.heading)
                        RatingView(caregiver.rating, count: caregiver.reviewCount)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    if caregiver.isIdentityVerified { VerifiedBadge("Identidade verificada") }
                    if let checked = caregiver.backgroundCheckedAt {
                        VerifiedBadge("Antecedentes OK · \(checked.formatted(.dateTime.month(.abbreviated).year()))",
                                      symbol: "shield.lefthalf.filled")
                    }
                }

                Text(caregiver.bio)

                if !caregiver.specialties.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Especialidades").font(.label)
                        ForEach(caregiver.specialties) { specialty in
                            Label(specialty.name, systemImage: "checkmark.circle.fill")
                                .foregroundStyle(Theme.ink)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Avaliações").font(.label)
                    ForEach(reviews) { review in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(review.authorName).font(.subheadline.weight(.semibold))
                                Spacer()
                                RatingView(Double(review.rating))
                            }
                            if let comment = review.comment { Text(comment).font(.subheadline) }
                            if !review.tags.isEmpty {
                                Text(review.tags.joined(separator: " · ")).font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                        .padding()
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
                    }
                }
            }
            .padding(Theme.padding)
        }
        .safeAreaInset(edge: .bottom) {
            Button("Reservar · \(result.estimatedTotal.brl)") { path.append(.confirm(result, draft)) }
                .buttonStyle(PrimaryButtonStyle())
                .padding(Theme.padding)
                .background(.bar)
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { reviews = (try? await model.deps.caregivers.reviews(for: caregiver.id)) ?? [] }
    }
}

// MARK: - Confirmar e pagar

struct ConfirmBookingView: View {
    @Environment(AppModel.self) private var model
    let result: CaregiverResult
    let draft: BookingDraft
    @Binding var path: [ClientRoute]
    @State private var price: PriceBreakdown?
    @State private var isBooking = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                ValueRow("Cuidador", result.caregiver.name)
                ValueRow("Início", draft.start.formatted(date: .abbreviated, time: .shortened))
                ValueRow("Término", draft.end.formatted(date: .abbreviated, time: .shortened))
                ValueRow("Endereço", model.address.label)
            }
            if let price {
                Section("Valor") { PriceBreakdownView(price: price) }
            }
            Section {
                Label("O valor fica reservado no cartão ou Pix e só é repassado ao cuidador depois do serviço.",
                      systemImage: "lock.fill")
                Label("Cancelamento grátis até 24 horas antes do início.", systemImage: "calendar.badge.clock")
            }
            .font(.footnote)
            .foregroundStyle(Theme.muted)

            if let error {
                Text(error).foregroundStyle(Theme.danger)
            }
        }
        .navigationTitle("Confirmar reserva")
        .safeAreaInset(edge: .bottom) {
            Button(price.map { "Confirmar e pagar \($0.total.brl)" } ?? "Calculando…", action: book)
                .buttonStyle(PrimaryButtonStyle(isLoading: isBooking))
                .disabled(price == nil || isBooking)
                .padding(Theme.padding)
                .background(.bar)
        }
        .task { await quote() }
    }

    private func quote() async {
        do {
            let rule = try await model.deps.pricing.rule(for: draft.category, city: model.address.city)
            price = try PricingEngine().quote(draft.quoteRequest(distanceKm: result.distanceKm), rule: rule)
        } catch {
            self.error = friendlyMessage(for: error)
        }
    }

    private func book() {
        isBooking = true
        Task {
            defer { isBooking = false }
            do {
                let booking = try await model.deps.bookings.create(NewBooking(
                    caregiverId: result.caregiver.id, addressId: model.address.id,
                    request: draft.quoteRequest(distanceKm: result.distanceKm), notes: draft.notes))
                path = [.booking(booking.id)]
            } catch {
                self.error = friendlyMessage(for: error)
            }
        }
    }
}

// MARK: - Reservas

struct BookingsListView: View {
    @Environment(AppModel.self) private var model
    @State private var bookings: [Booking] = []

    var body: some View {
        NavigationStack {
            Group {
                if bookings.isEmpty {
                    ContentUnavailableView("Nenhuma reserva ainda", systemImage: "calendar",
                                           description: Text("Suas reservas aparecem aqui."))
                } else {
                    List(bookings) { booking in
                        NavigationLink(value: booking.id) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(booking.category.title) com \(booking.caregiver.firstName)").font(.headline)
                                Text(booking.start.formatted(date: .abbreviated, time: .shortened))
                                    .foregroundStyle(Theme.muted)
                                Text(booking.status.title).font(.caption.weight(.semibold))
                                    .foregroundStyle(booking.status.isActive ? Theme.accent : Theme.muted)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Reservas")
            .navigationDestination(for: UUID.self) { LiveServiceView(bookingId: $0) }
            .task { bookings = (try? await model.deps.bookings.myBookings()) ?? [] }
            .refreshable { bookings = (try? await model.deps.bookings.myBookings()) ?? [] }
        }
    }
}

struct AccountView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(model.session?.name ?? "")
                        .font(.headline)
                }
                Section("Segurança") {
                    Label("Contatos de emergência", systemImage: "person.2.wave.2")
                    Label("Verificação de identidade", systemImage: "checkmark.shield")
                }
                Section {
                    Button("Sair", role: .destructive) { Task { await model.signOut() } }
                }
            }
            .navigationTitle("Conta")
        }
    }
}
