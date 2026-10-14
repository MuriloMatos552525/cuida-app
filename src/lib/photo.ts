import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { ApiError } from './api';

// Foto para verificação: reduzida para ~1200 px e JPEG comprimido, para caber no banco (< 1 MB).

export type PhotoSource = 'camera' | 'galeria';

/** Devolve o JPEG em base64, ou null se a pessoa cancelar. */
export async function pickPhoto(source: PhotoSource, front = false): Promise<string | null> {
  // No navegador não há câmera pelo ImagePicker; abre o seletor de arquivos.
  const useCamera = source === 'camera' && Platform.OS !== 'web';
  if (useCamera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new ApiError('Libere o acesso à câmera nos ajustes do celular.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > 1200 || (asset.height ?? 0) > 1200) {
    context.resize(asset.width >= asset.height ? { width: 1200 } : { height: 1200 });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) throw new ApiError('Não foi possível ler a foto. Tente de novo.');
  return saved.base64.replace(/^data:image\/\w+;base64,/, '');
}
