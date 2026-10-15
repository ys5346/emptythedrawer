import SwiftUI
import PhotosUI

/// Shown when a pickup is marked done: how many items were collected, and an optional photo.
struct PickedUpSheet: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let pickup: Pickup

    @State private var count: Int
    @State private var photo: UIImage?
    @State private var takingPhoto = false
    @State private var libraryItem: PhotosPickerItem?
    @State private var saving = false

    init(pickup: Pickup) {
        self.pickup = pickup
        _count = State(initialValue: pickup.itemCount ?? pickup.bookedItemCount ?? 1)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                counter
                photoTile
                Spacer(minLength: 0)
                Button(action: save) {
                    Group {
                        if saving { ProgressView().tint(.white) } else { Label("Mark Picked Up", systemImage: "checkmark.circle.fill") }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 14))
                .controlSize(.large)
                .tint(.green)
                .disabled(saving)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
            .navigationTitle(pickup.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.height(520), .large])
        .presentationCornerRadius(24)
        .interactiveDismissDisabled(saving)
        .fullScreenCover(isPresented: $takingPhoto) {
            CameraPicker { image in photo = image }
                .ignoresSafeArea()
        }
        .onChange(of: libraryItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    photo = image
                }
            }
        }
    }

    // MARK: Items collected

    private var counter: some View {
        VStack(spacing: 10) {
            Text("Items collected")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            HStack(spacing: 28) {
                CountButton(systemImage: "minus", enabled: count > 1) { count -= 1 }
                Text("\(count)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(count)))
                    .frame(minWidth: 80)
                CountButton(systemImage: "plus", enabled: count < 999) { count += 1 }
            }
            .animation(.snappy, value: count)
            .sensoryFeedback(.selection, trigger: count)
            if let booked = pickup.bookedItemCount, booked != count {
                Text("Booked as \(booked) item\(booked == 1 ? "" : "s")")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(.background.secondary, in: .rect(cornerRadius: 18, style: .continuous))
    }

    // MARK: Photo

    @ViewBuilder private var photoTile: some View {
        if let photo {
            Image(uiImage: photo)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 150)
                .clipShape(.rect(cornerRadius: 18, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    Button { withAnimation { self.photo = nil } } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .black.opacity(0.55))
                    }
                    .padding(10)
                    .accessibilityLabel("Remove photo")
                }
        } else {
            Group {
                if CameraPicker.isAvailable {
                    Button { takingPhoto = true } label: { photoLabel("Take a Photo") }
                } else {
                    PhotosPicker(selection: $libraryItem, matching: .images) { photoLabel("Choose a Photo") }
                }
            }
            .buttonStyle(.plain)
        }
    }

    private func photoLabel(_ title: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: "camera.fill").font(.title2)
            Text(title).font(.subheadline.weight(.semibold))
            Text("Optional · saved privately to Google Drive").font(.caption).foregroundStyle(.secondary)
        }
        .foregroundStyle(.tint)
        .frame(maxWidth: .infinity)
        .frame(height: 150)
        .background(.tint.opacity(0.08), in: .rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(.tint.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
        }
    }

    private func save() {
        saving = true
        Task {
            let jpeg = photo.flatMap { $0.smallJPEG() }
            if await store.markPickedUp(pickup, items: count, photo: jpeg) { dismiss() }
            saving = false
        }
    }
}

private struct CountButton: View {
    let systemImage: String
    let enabled: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title2.weight(.semibold))
                .frame(width: 58, height: 58)
                .background(.tint.opacity(0.12), in: .circle)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .buttonRepeatBehavior(.enabled)
    }
}

/// The iPhone camera, for one photo.
struct CameraPicker: UIViewControllerRepresentable {
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
    var onPick: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let vc = UIImagePickerController()
        vc.sourceType = .camera
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onPick(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

extension UIImage {
    /// About 150–300 KB: small enough to upload on a weak signal, clear enough to see what was collected.
    func smallJPEG(maxSide: CGFloat = 1280) -> Data? {
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.6)
    }
}
