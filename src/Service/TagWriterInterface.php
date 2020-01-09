<?php

namespace App\Service;

interface TagWriterInterface
{
  public function write(string $fileName, array $tags): void;

  public function getAudioDirectory(): string;

  public function getAlbumArtDirectory(): string;
}
