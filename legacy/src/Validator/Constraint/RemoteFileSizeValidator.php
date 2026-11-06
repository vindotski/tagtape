<?php

namespace App\Validator\Constraint;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class RemoteFileSizeValidator extends ConstraintValidator
{
  public function validate($value, Constraint $constraint)
  {
    if (!$constraint instanceof RemoteFileSize) {
      throw new UnexpectedTypeException($constraint, RemoteFileSize::class);
    }

    if (null === $value) {
      return;
    }

    $file_headers = @get_headers($value);
    if (!$file_headers || $file_headers[0] == 'HTTP/1.1 404 Not Found') {
      $this->context->buildViolation($constraint->offlineMessage)
        ->setCode(RemoteFileSize::FILE_NOT_FOUND)
        ->addViolation();
      return;
    }

    $fileSize = $this->getRemoteFileSize($value);

    if (null == $fileSize || -1 === $fileSize) {
      $this->context->buildViolation($constraint->unknownMessage)
        ->setCode(RemoteFileSize::FILE_SIZE_UNKNOWN)
        ->addViolation();
      return;
    }

    if ($fileSize > $constraint->max) {
      $this->context->buildViolation($constraint->maxMessage)
        ->setParameter('{{ limit }}', $constraint->max)
        ->setCode(RemoteFileSize::FILE_SIZE_EXCEEDED)
        ->setInvalidValue($fileSize)
        ->addViolation();
    }
  }

  private function getRemoteFileSize($url): int
  {
    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    curl_setopt($ch, CURLOPT_HEADER, TRUE);
    curl_setopt($ch, CURLOPT_NOBODY, TRUE);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $data = curl_exec($ch);
    $size = curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);

    curl_close($ch);
    return (int) ($size / 1000);
  }
}
