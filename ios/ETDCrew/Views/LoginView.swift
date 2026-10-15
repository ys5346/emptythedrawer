import SwiftUI

struct LoginView: View {
    @Environment(CrewStore.self) private var store
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false
    @State private var failures = 0
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            AppMark(size: 84)
                .padding(.bottom, 24)

            Text("Crew Sign In")
                .font(.largeTitle.bold())
            Text("Enter the crew passcode to see your pickups.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 6)

            SecureField("Passcode", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.password)
                .font(.title2.monospacedDigit())
                .multilineTextAlignment(.center)
                .padding(.vertical, 16)
                .background(.background.secondary, in: .rect(cornerRadius: 14))
                .focused($focused)
                .padding(.top, 32)
                .modifier(Shake(trigger: failures))
                .submitLabel(.go)
                .onSubmit(signIn)

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    .transition(.opacity)
            }

            Button(action: signIn) {
                Group {
                    if busy { ProgressView().tint(.white) } else { Text("Sign In") }
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .buttonBorderShape(.roundedRectangle(radius: 14))
            .disabled(code.isEmpty || busy)
            .padding(.top, 20)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 460)
        .animation(.smooth, value: error)
        .sensoryFeedback(.error, trigger: failures)
        .onAppear { focused = true }
    }

    private func signIn() {
        guard !code.isEmpty, !busy else { return }
        busy = true
        error = nil
        Task {
            if let message = await store.signIn(code) {
                error = message
                failures += 1
                code = ""
            }
            busy = false
        }
    }
}

/// The app icon: a lime drawer front on dark green.
struct AppMark: View {
    var size: CGFloat
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
            .fill(Color.ink)
            .frame(width: size, height: size)
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.09, style: .continuous)
                    .fill(Color.lime)
                    .frame(width: size * 0.62, height: size * 0.41)
                    .overlay(alignment: .bottom) {
                        Capsule().fill(Color.ink)
                            .frame(width: size * 0.27, height: size * 0.066)
                            .padding(.bottom, size * 0.085)
                    }
            }
            .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
    }
}

/// Side-to-side shake for a wrong passcode.
struct Shake: GeometryEffect {
    var trigger: Int
    var animatableData: CGFloat
    init(trigger: Int) { self.trigger = trigger; animatableData = CGFloat(trigger) }
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(animatableData * .pi * 4), y: 0))
    }
}

extension Color {
    static let ink = Color("Ink")
    static let lime = Color("Lime")
}
