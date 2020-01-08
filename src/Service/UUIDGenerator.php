<?php

namespace App\Service;

use Ramsey\Uuid\Uuid;

final class UUIDGenerator implements UUIDGeneratorInterface
{
  public function generate(): string
  {
    return str_replace('-', '', Uuid::uuid4()->toString());
  }
}
