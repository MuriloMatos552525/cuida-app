import Core
import DesignSystem
import SwiftUI

/// Login por telefone com código SMS.
struct PhoneLoginView: View {
    @Environment(AppModel.self) private var model
    @State private var phone = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer()
            Text("Cuidado de confiança,\nperto de você.")
                .font(.display)
            Text("Babás, pet sitters e cuidadores de idosos verificados: CPF, rosto e antecedentes.")
                .foregroundStyle(Theme.muted)

            if codeSent {
                TextField("Código de 6 dígitos", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.title2.monospacedDigit())
                    .padding()
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
            } else {
                TextField("Celular com DDD", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .font(.title2)
                    .padding()
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))
            }

            if let error {
                Text(error).foregroundStyle(Theme.danger).font(.footnote)
            }

            Button(codeSent ? "Entrar" : "Receber código por SMS", action: submit)
                .buttonStyle(PrimaryButtonStyle(isLoading: isLoading))
                .disabled(isLoading || (codeSent ? code.count != 6 : phone.filter(\.isNumber).count < 10))

            if model.deps.isDemo {
                Text("Modo de exemplo: qualquer telefone e código de 6 dígitos funcionam.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(Theme.padding)
    }

    private var e164: String { "+55" + phone.filter(\.isNumber) }

    private func submit() {
        isLoading = true
        error = nil
        Task {
            defer { isLoading = false }
            do {
                if codeSent {
                    let session = try await model.deps.auth.verify(phone: e164, code: code)
                    model.signedIn(session)
                } else {
                    try await model.deps.auth.sendCode(toPhone: e164)
                    codeSent = true
                }
            } catch {
                self.error = codeSent ? "Código inválido ou expirado." : friendlyMessage(for: error)
            }
        }
    }
}

/// Escolha entre contratar e trabalhar. A verificação de identidade vem logo depois.
struct RolePickerView: View {
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var isLoading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Como você quer usar o app?").font(.heading)

            TextField("Seu nome completo", text: $name)
                .textContentType(.name)
                .padding()
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.corner))

            roleButton(.client, title: "Quero contratar", subtitle: "Encontre cuidadores verificados", symbol: "house.fill")
            roleButton(.caregiver, title: "Quero trabalhar", subtitle: "Receba pedidos perto de você", symbol: "briefcase.fill")

            Spacer()
            Text("Para a segurança de todos, vamos pedir CPF e uma selfie antes da primeira reserva.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
        }
        .padding(Theme.padding)
        .disabled(isLoading)
    }

    private func roleButton(_ role: UserRole, title: String, subtitle: String, symbol: String) -> some View {
        Button {
            isLoading = true
            Task {
                defer { isLoading = false }
                if let session = try? await model.deps.auth.chooseRole(role, name: name) {
                    model.signedIn(session)
                }
            }
        } label: {
            CategoryCard(title: title, subtitle: subtitle, symbol: symbol)
        }
        .buttonStyle(.plain)
        .disabled(name.trimmingCharacters(in: .whitespaces).split(separator: " ").count < 2)
    }
}
