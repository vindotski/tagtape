<?php

namespace App\Service;

use Exception;
use getid3_writetags;
use Symfony\Component\Filesystem\Exception\FileNotFoundException;
use Symfony\Component\HttpKernel\KernelInterface;

final class DefaultTagWriter implements TagWriter
{
  private $albumArtDir;
  private $kernel;

  public function __construct(string $albumArtDir, KernelInterface $kernel)
  {
    $this->albumArtDir = rtrim(rtrim($albumArtDir, '/'), '\\');
    $this->kernel = $kernel;
  }

  public function write(string $filePath, array $tags): void
  {
    $tagData = [];
    foreach ($tags as $key => $value) {
      if ($key === 'cover') {
        $tagData['attached_picture'] = $this->getAlbumArtData($value);
      } elseif ($key === 'track') {
        $tagData['tracknumber'] = [$value]; // tracknumber is preferred by older players
      } else {
        $tagData[$key] = [$value];
      }
    }

    $tagWriter = $this->newWriterInstance($filePath);
    $tagWriter->tag_data = $tagData;
    $tagWriter->WriteTags();
  }

  public function getAudioDirectory(): string
  {
    return $this->audioDir;
  }

  public function getAlbumArtDirectory(): string
  {
    return $this->albumArtDir;
  }

  private function newWriterInstance(string $filePath)
  {
    if (!is_file($filePath)) {
      throw new FileNotFoundException('File not found: ' . $filePath);
    }

    include_once($this->kernel->getProjectDir() . '/vendor/james-heinrich/getid3/getid3/getid3.php');
    if ($this->kernel->isDebug()) {
      // Suppress notice about using system's temporary dir
      error_reporting(E_ALL & ~E_NOTICE);
    }

    $tagWriter = new getid3_writetags();
    $tagWriter->filename = $filePath;
    $tagWriter->tagformats = ['id3v2.4'];
    return $tagWriter;
  }

  private function getAlbumArtData(string $imageFileName): array
  {
    $albumArtFile = $this->getAlbumArtDirectory() . '/' . $imageFileName;
    if (!is_file($albumArtFile)) {
      throw new FileNotFoundException('Could not find album art: ' . $imageFileName);
    }

    if ($fileHandle = @fopen($albumArtFile, 'rb')) {
      $imageData = fread($fileHandle, filesize($albumArtFile));
      fclose($fileHandle);

      $albumArtData = [];
      $albumArtData[0]['data'] = $imageData;
      $albumArtData[0]['picturetypeid'] = 0x03; // 'Cover (front)'
      $albumArtData[0]['description'] = '';
      $albumArtData[0]['mime'] = 'image/jpeg';
      return $albumArtData;
    }

    throw new Exception('Cannot process album art file: ' . $albumArtFile);
  }
}
