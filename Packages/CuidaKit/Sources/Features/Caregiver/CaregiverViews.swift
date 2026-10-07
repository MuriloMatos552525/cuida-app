import Core
import DesignSystem
import SwiftUI

struct CaregiverTabView: View {
    var body: some View {
        TabView {
            CaregiverHomeView()
                .tabItem { Label("Pedidos", systemImage: "bell") }
            VerificationStatusView()
                .tabItem { Label("Verificação", systemImage: "checkmark.shield") }
            AccountView()
                .tabItem { Label("Conta", systemImage: "person.crop.circle") }
        }
    }
}

/// Liga/desliga a disponibilidade e mostra os pedidos novos para aceitar ou recusar.
struct CaregiverHomeView: View {
    @Environment(AppModel.self) private var model
    @State private var available = true
    @State private var requests: [Booking] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $available) {
                        VStack(alignment: .leading) {
                            Text(available ? "Disponível" : "Indisponível").font(.headline)
                            Text(available ? "Você aparece nas buscas perto de você." : "Você não recebe novos pedidos.")
                                .font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                    .onChange(of: available) { _, value in
                        Task { try? await model.deps.work.setAvailable(value) }
                    }
                }

                Section("Novos pedidos") {
                    if requests.isEmpty {
                        Text("Nenhum pedido no momento.").foregroundStyle(Theme.muted)
                    }
                    ForEach(requests) { booking in
                        NavigationLink(value: booking.id) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(booking.category.title).font(.headline)
                                Text(booking.start.formatted(date: .abbreviated, time: .shortened))
                                Text("Você recebe \(booking.price.caregiverPayout.brl)")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pedidos")
            .navigationDestination(for: UUID.self) { LiveServiceView(bookingId: $0) }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        requests = (try? await model.deps.work.incomingRequests()) ?? []
    }
}

/// Passo a passo da verificação. O cuidador só aparece nas buscas com tudo aprovado.
struct VerificationStatusView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Verification] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(items, id: \.kind) { item in
                        HStack {
                            Image(systemName: icon(item.status)).foregroundStyle(color(item.status))
                            VStack(alignment: .leading) {
                                Text(item.kind.title)
                                Text(label(item.status)).font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if item.status == .pending || item.status == .rejected || item.status == .expired {
                                Button("Enviar") {} // TODO: abrir o fluxo do provedor de verificação (KYC)
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                    }
                } footer: {
                    Text("A certidão de antecedentes é renovada a cada 6 meses. Seus dados ficam protegidos e o cliente vê apenas os selos.")
                }
            }
            .navigationTitle("Verificação")
            .task { items = (try? await model.deps.work.verifications()) ?? [] }
        }
    }

    private func icon(_ status: VerificationStatus) -> String {
        switch status {
        case .approved: "checkmark.circle.fill"
        case .inReview: "clock.fill"
        case .pending: "circle"
        case .rejected, .expired: "exclamationmark.circle.fill"
        }
    }

    private func color(_ status: VerificationStatus) -> Color {
        switch status {
        case .approved: Theme.accent
        case .inReview, .pending: Theme.muted
        case .rejected, .expired: Theme.danger
        }
    }

    private func label(_ status: VerificationStatus) -> String {
        switch status {
        case .approved: "Aprovado"
        case .inReview: "Em análise"
        case .pending: "Falta enviar"
        case .rejected: "Reprovado, envie de novo"
        case .expired: "Vencido, envie de novo"
        }
    }
}
